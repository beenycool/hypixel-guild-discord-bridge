import type { Logger } from 'log4js'
import type { Cache, CacheFactory } from 'prismarine-auth'

import type { PostgresManager } from '../../common/postgres-manager.js'

export class SessionsManager {
  constructor(
    private readonly postgresManager: PostgresManager,
    private readonly logger: Logger
  ) {}

  public getSessionsFactory(instanceName: string): CacheFactory {
    return (options: { username: string; cacheName: string }): Cache => {
      return new Session(this, this.postgresManager, this.logger, instanceName, options.username, options.cacheName)
    }
  }

  public async deleteSession(instanceName: string): Promise<number> {
    const result = await this.postgresManager.execute(
      'DELETE FROM "mojangSessions" WHERE name = $1',
      [instanceName]
    )
    if (result !== 0) {
      this.logger.debug(`Deleted Minecraft instance with the name=${instanceName}`)
    }
    return result
  }

  public async setSession(
    instanceName: string,
    name: string,
    cacheName: string,
    value: Record<string, unknown>
  ): Promise<void> {
    await this.postgresManager.execute(
      `INSERT INTO "mojangSessions" (name, "cacheName", value, "createdAt")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name, "cacheName") DO UPDATE SET
         value = EXCLUDED.value,
         "createdAt" = EXCLUDED."createdAt"`,
      [name, cacheName, JSON.stringify(value), Math.floor(Date.now() / 1000)]
    )
  }

  public async getAllInstances(): Promise<readonly MinecraftInstanceConfig[]> {
    return await this.postgresManager.withTransaction(async (client) => {
      const instancesResult = await client.query('SELECT * FROM "mojangInstances"')
      const foundInstances = instancesResult.rows as MojangInstance[]

      const instances = new Map<string, MinecraftInstanceConfig>()
      for (const instance of foundInstances) {
        let proxy: ProxyConfig | undefined
        if (instance.proxyId !== null && instance.proxyId !== undefined) {
          const proxyResult = await client.query('SELECT * FROM "proxies" WHERE id = $1', [instance.proxyId])
          proxy = proxyResult.rows[0] as ProxyConfig | undefined
        }
        instances.set(instance.name, { name: instance.name, proxy: proxy })
      }

      return [...instances.values()]
    })
  }

  public async getInstance(instanceName: string): Promise<MinecraftInstanceConfig | undefined> {
    return await this.postgresManager.withTransaction(async (client) => {
      const instanceResult = await client.query(
        'SELECT * FROM "mojangInstances" WHERE LOWER(name) = LOWER($1)',
        [instanceName]
      )
      const instance = instanceResult.rows[0] as MojangInstance | undefined
      if (!instance) return undefined

      let proxy: ProxyConfig | undefined
      if (instance.proxyId !== null && instance.proxyId !== undefined) {
        const proxyResult = await client.query('SELECT * FROM "proxies" WHERE id = $1', [instance.proxyId])
        proxy = proxyResult.rows[0] as ProxyConfig | undefined
      }

      return { name: instance.name, proxy: proxy }
    })
  }

  public async addInstance(options: MinecraftInstanceConfig): Promise<void> {
    await this.postgresManager.withTransaction(async (client) => {
      let proxyId: number | undefined
      if (options.proxy !== undefined) {
        const proxyResult = await client.query(
          `INSERT INTO "proxies" (protocol, host, port, "user", password)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [options.proxy.protocol, options.proxy.host, options.proxy.port, options.proxy.user, options.proxy.password]
        )
        proxyId = proxyResult.rows[0].id as number
      }

      await client.query(
        'INSERT INTO "mojangInstances" (name, "proxyId") VALUES ($1, $2)',
        [options.name, proxyId ?? null]
      )
    })
  }

  public async deleteInstance(instanceName: string): Promise<number> {
    return await this.postgresManager.withTransaction(async (client) => {
      const instance = await this.getInstance(instanceName)
      if (instance === undefined) return 0

      const deleteResult = await client.query(
        'DELETE FROM "mojangInstances" WHERE LOWER(name) = LOWER($1)',
        [instance.name]
      )
      const result = deleteResult.rowCount ?? 0
      if (result !== 0) {
        this.logger.debug(`Deleted Minecraft instance with the name=${instanceName}`)
      }

      if (instance.proxy !== undefined) {
        const proxyDeleteResult = await client.query('DELETE FROM "proxies" WHERE id = $1', [instance.proxy.id])
        if ((proxyDeleteResult.rowCount ?? 0) !== 0) {
          this.logger.debug(
            `Deleted related proxy with the id=${instance.proxy.id} to the Minecraft instance with the name=${instanceName}`
          )
        }
      }

      return result
    })
  }
}

interface MojangInstance {
  name: string
  proxyId: number | null | undefined
}

export interface MinecraftInstanceConfig {
  name: string
  proxy: ProxyConfig | undefined
}

export interface ProxyConfig {
  /** only set if fetched from database */
  id: number
  host: string
  port: number
  user: string | undefined
  password: string | undefined
  protocol: ProxyProtocol
}

export enum ProxyProtocol {
  Http = 'http',
  Socks5 = 'socks5'
}

class Session implements Cache {
  constructor(
    private readonly sessionsManager: SessionsManager,
    private readonly postgresManager: PostgresManager,
    private readonly logger: Logger,
    readonly instanceName: string,
    readonly name: string,
    readonly cacheName: string
  ) {}

  async reset(): Promise<void> {
    const result = await this.postgresManager.execute(
      'DELETE FROM "mojangSessions" WHERE name = $1 AND "cacheName" = $2',
      [this.name, this.cacheName]
    )
    if (result !== 0) {
      this.logger.debug(`Deleted sessions for name=${this.name} and cacheName=${this.cacheName}`)
    }
  }

  async getCached(): Promise<Record<string, unknown>> {
    const result = await this.postgresManager.queryOne<{ value: string }>(
      'SELECT value FROM "mojangSessions" WHERE name = $1 AND "cacheName" = $2',
      [this.name, this.cacheName]
    )
    return result === undefined ? {} : (JSON.parse(result.value) as Record<string, unknown>)
  }

  async setCached(value: Record<string, unknown>): Promise<void> {
    await this.sessionsManager.setSession(this.instanceName, this.name, this.cacheName, value)
  }

  async setCachedPartial(value: Record<string, unknown>): Promise<void> {
    await this.postgresManager.withTransaction(async () => {
      const partial = await this.getCached()
      await this.setCached({ ...partial, ...value })
    })
  }
}
