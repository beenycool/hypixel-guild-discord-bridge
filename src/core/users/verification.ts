import type { UserLink } from '../../common/application-event.js'
import type { PostgresManager } from '../../common/postgres-manager.js'

export class Verification {
  private readonly database: VerificationDatabase

  constructor(postgresManager: PostgresManager) {
    this.database = new VerificationDatabase(postgresManager)
  }

  public async findByDiscord(discordId: string): Promise<UserLink | undefined> {
    return this.database.getLinkByDiscord(discordId)
  }

  public async findByIngame(uuid: string): Promise<UserLink | undefined> {
    return this.database.getLinkByUuid(uuid)
  }

  public async addConfirmedLink(discordId: string, uuid: string): Promise<void> {
    await this.database.addLink(discordId, uuid)
  }

  public async invalidate(options: { discordId?: string; uuid?: string }): Promise<number> {
    let count = 0
    if (options.uuid !== undefined) count += await this.database.invalidateUuid(options.uuid)
    if (options.discordId !== undefined) count += await this.database.invalidateDiscord(options.discordId)
    return count
  }
}

class VerificationDatabase {
  constructor(private readonly postgresManager: PostgresManager) {}

  public async addLink(discordId: string, uuid: string): Promise<void> {
    await this.postgresManager.withTransaction(async (client) => {
      await client.query('DELETE FROM "links" WHERE uuid = $1 OR "discordId" = $2', [uuid, discordId])
      await client.query('INSERT INTO "links" (uuid, "discordId") VALUES ($1, $2)', [uuid, discordId])
    })
  }

  public async getLinkByUuid(uuid: string): Promise<UserLink | undefined> {
    const result = await this.postgresManager.queryOne<UserLink>(
      'SELECT uuid, "discordId" FROM "links" WHERE uuid = $1 LIMIT 1',
      [uuid]
    )
    return result
  }

  public async getLinkByDiscord(discordId: string): Promise<UserLink | undefined> {
    const result = await this.postgresManager.queryOne<UserLink>(
      'SELECT uuid, "discordId" FROM "links" WHERE "discordId" = $1 LIMIT 1',
      [discordId]
    )
    return result
  }

  public async invalidateUuid(uuid: string): Promise<number> {
    return await this.postgresManager.execute('DELETE FROM "links" WHERE uuid = $1', [uuid])
  }

  public async invalidateDiscord(discordId: string): Promise<number> {
    return await this.postgresManager.execute('DELETE FROM "links" WHERE "discordId" = $1', [discordId])
  }
}
