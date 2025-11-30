import assert from 'node:assert'

import DefaultAxios, { AxiosError, HttpStatusCode } from 'axios'
import PromiseQueue from 'promise-queue'

import type { PostgresManager } from '../../common/postgres-manager.js'
import type { MojangProfile } from '../../common/user.js'
import RateLimiter from '../../utility/rate-limiter.js'

export class MojangApi {
  private static readonly RetryCount = 3
  private readonly queue = new PromiseQueue(1)
  private readonly rateLimit = new RateLimiter(1, 800)

  private readonly mojangDatabase: MojangDatabase

  constructor(private readonly postgresManager: PostgresManager) {
    this.mojangDatabase = new MojangDatabase(this.postgresManager)
  }

  async profileByUsername(username: string): Promise<MojangProfile> {
    const cachedResult = await this.mojangDatabase.profileByUsername(username)
    if (cachedResult) return cachedResult

    const result = await this.queue.add(async () => {
      let lastError: Error | undefined
      for (let retry = 0; retry < MojangApi.RetryCount; retry++) {
        await this.rateLimit.wait()

        try {
          return await DefaultAxios.get<MojangProfile>(
            `https://api.minecraftservices.com/minecraft/profile/lookup/name/${username}`
          ).then((response) => response.data)
        } catch (error: unknown) {
          if (error instanceof Error) lastError = error
          if (error instanceof AxiosError && error.status === HttpStatusCode.TooManyRequests) continue

          throw error
        }
      }

      throw lastError ?? new Error('Failed fetching new data')
    })

    await this.cache([result])
    return result
  }

  async profileByUuid(uuid: string): Promise<MojangProfile> {
    assert.ok(uuid.length === 32 || uuid.length === 36, `'uuid' must be valid UUID. given ${uuid}`)

    const cachedResult = await this.mojangDatabase.profileByUuid(uuid)
    if (cachedResult) return cachedResult

    const result = await this.queue.add(async () => {
      let lastError: Error | undefined

      for (let retry = 0; retry < MojangApi.RetryCount; retry++) {
        await this.rateLimit.wait()

        try {
          return await DefaultAxios.get<MojangProfile>(
            `https://api.minecraftservices.com/minecraft/profile/lookup/${uuid}`
          ).then((response) => response.data)
        } catch (error: unknown) {
          if (error instanceof Error) lastError = error
          if (error instanceof AxiosError && error.status === HttpStatusCode.TooManyRequests) continue

          throw error
        }
      }

      throw lastError ?? new Error('Failed fetching new data')
    })

    await this.cache([result])
    return result
  }

  async profilesByUsername(usernames: Set<string>): Promise<Map<string, string | undefined>> {
    const result = new Map<string, string | undefined>()

    const requests: Promise<void>[] = []

    const queue = (usernamesChunk: string[]) =>
      this.lookupUsernames(usernamesChunk)
        .then((profiles) => {
          for (const profile of profiles) {
            result.set(profile.name, profile.id)
          }

          const resolvedProfileNames = new Set(profiles.map((profile) => profile.name.toLowerCase()))
          for (const username of usernamesChunk) {
            if (!resolvedProfileNames.has(username.toLowerCase())) {
              result.set(username, undefined)
            }
          }
        })
        .catch(() => {
          for (const username of usernames) {
            result.set(username, undefined)
          }
        })

    const chunkSize = 10 // Mojang only allow up to 10 usernames per lookup
    let chunk: string[] = []
    for (const username of usernames) {
      const cachedProfile = await this.mojangDatabase.profileByUsername(username)
      if (cachedProfile !== undefined) {
        result.set(username, cachedProfile.id)
        continue
      }

      chunk.push(username)
      if (chunk.length >= chunkSize) {
        requests.push(queue(chunk))
        chunk = []
      }
    }
    if (chunk.length > 0) requests.push(queue(chunk))

    await Promise.all(requests)

    return result
  }

  public async cache(profiles: MojangProfile[]): Promise<void> {
    await this.mojangDatabase.add(profiles)
  }

  private async lookupUsernames(usernames: string[]): Promise<MojangProfile[]> {
    const result = await this.queue.add(async () => {
      let lastError: Error | undefined
      for (let retry = 0; retry < MojangApi.RetryCount; retry++) {
        await this.rateLimit.wait()
        try {
          return await DefaultAxios.post<MojangProfile[]>(
            `https://api.minecraftservices.com/minecraft/profile/lookup/bulk/byname`,
            usernames
          ).then((response) => response.data)
        } catch (error: unknown) {
          if (error instanceof Error) lastError = error
          if (error instanceof AxiosError && error.status === HttpStatusCode.TooManyRequests) continue

          throw error
        }
      }

      throw lastError ?? new Error('Failed fetching new data')
    })

    await this.cache(result)
    return result
  }
}

class MojangDatabase {
  private static readonly MaxAge = 7 * 24 * 60 * 60 * 1000

  constructor(private readonly postgresManager: PostgresManager) {}

  public async add(profiles: MojangProfile[]): Promise<void> {
    await this.postgresManager.withTransaction(async (client) => {
      for (const profile of profiles) {
        await client.query(
          `INSERT INTO "mojang" (uuid, username, "loweredName")
           VALUES ($1, $2, $3)
           ON CONFLICT (uuid) DO UPDATE SET
             username = EXCLUDED.username,
             "loweredName" = EXCLUDED."loweredName",
             "createdAt" = FLOOR(EXTRACT(EPOCH FROM NOW()))`,
          [profile.id, profile.name, profile.name.toLowerCase()]
        )
      }
    })
  }

  public async profileByUsername(username: string): Promise<MojangProfile | undefined> {
    const result = await this.postgresManager.queryOne<{ id: string; name: string }>(
      `SELECT uuid as id, username as name FROM "mojang"
       WHERE "loweredName" = $1 AND "createdAt" > $2`,
      [username.toLowerCase(), Math.floor((Date.now() - MojangDatabase.MaxAge) / 1000)]
    )
    return result
  }

  public async profileByUuid(uuid: string): Promise<MojangProfile | undefined> {
    const result = await this.postgresManager.queryOne<{ id: string; name: string }>(
      `SELECT uuid as id, username as name FROM "mojang"
       WHERE uuid = $1 AND "createdAt" > $2`,
      [uuid, Math.floor((Date.now() - MojangDatabase.MaxAge) / 1000)]
    )
    return result
  }
}
