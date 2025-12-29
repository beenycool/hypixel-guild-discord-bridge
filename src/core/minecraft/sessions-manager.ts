import assert from 'node:assert'

import type { Logger } from 'log4js'
import type { Cache, CacheFactory } from 'prismarine-auth'

import type { SqliteManager } from '../../common/sqlite-manager'

export class SessionsManager {
  constructor(
    private readonly sqliteManager: SqliteManager,
    private readonly logger: Logger
  ) {}

  public getSessionsFactory(instanceName: string): CacheFactory {
    return (options: { username: string; cacheName: string }): Cache => {
      return new Session(this, this.sqliteManager, this.logger, instanceName, options.username, options.cacheName)
    }
  }

  public deleteSession(instanceName: string): number {
    const database = this.sqliteManager.getDatabase()
    const transaction = database.transaction(() => {
      const statement = database.prepare('DELETE FROM "mojangSessions" WHERE name = ?')
      const result = statement.run(instanceName).changes
      if (result !== 0) {
        this.logger.debug(`Deleted Minecraft instance with the name=${instanceName}`)
      }

      return result
    })

    return transaction()
  }

  public clearCachedSessions(instanceName: string): number {
    const MainSessionName = 'live'

    const database = this.sqliteManager.getDatabase()
    const transaction = database.transaction(() => {
      const statement = database.prepare('DELETE FROM "mojangSessions" WHERE name = ? AND cacheName != ?')
      const result = statement.run(instanceName, MainSessionName).changes
      if (result !== 0) {
        this.logger.debug(`Deleted ${result} Minecraft cached session files with the name=${instanceName}`)
      }

      return result
    })

    return transaction()
  }

  public setSession(instanceName: string, name: string, cacheName: string, value: Record<string, unknown>): void {
    const database = this.sqliteManager.getDatabase()
    const statement = database.prepare(
      'INSERT OR REPLACE INTO "mojangSessions" (name, cacheName, value, createdAt) VALUES (?, ?, ?, ?)'
    )
    statement.run(name, cacheName, JSON.stringify(value), Math.floor(Date.now() / 1000))
  }

  public setInstanceAutoConnect(instanceName: string, enabled: boolean): void {
    const database = this.sqliteManager.getDatabase()
    const statement = database.prepare('UPDATE "mojangInstances" SET connect = ? WHERE name = ?')
    const result = statement.run(enabled ? '1' : '0', instanceName)
    assert.strictEqual(result.changes, 1, 'Did not manage to change the instance auto-connect settings?')
  }

  public getInstanceAutoConnect(instanceName: string): boolean {
    const database = this.sqliteManager.getDatabase()
    const statement = database.prepare('SELECT "connect" FROM  "mojangInstances" WHERE name = ?')
    const result = statement.pluck(true).get(instanceName) as number | undefined
    return result === undefined ? true : result === 1
  }

  public getAllInstances(): readonly MinecraftInstanceConfig[] {
    const database = this.sqliteManager.getDatabase()
    const transaction = database.transaction(() => {
      const selectInstance = database.prepare('SELECT * FROM "mojangInstances"')
      const selectProxy = database.prepare('SELECT * FROM "proxies" WHERE id = ?')

      const foundInstances = selectInstance.all() as MojangInstance[]

      const instances = new Map<string, MinecraftInstanceConfig>()
      for (const instance of foundInstances) {
        const proxy = instance.proxyId === undefined ? undefined : (selectProxy.get(instance.proxyId) as ProxyConfig)
        instances.set(instance.name, { name: instance.name, proxy: proxy })
      }

      return instances.values().toArray()
    })

    return transaction()
  }

  public getInstance(instanceName: string): MinecraftInstanceConfig | undefined {
    const database = this.sqliteManager.getDatabase()
    const transaction = database.transaction(() => {
      const selectInstance = database.prepare('SELECT * FROM "mojangInstances" WHERE name = ?')
      const instance = selectInstance.get(instanceName) as MojangInstance | undefined
      if (!instance) return

      let proxy: ProxyConfig | undefined
      if (instance.proxyId !== undefined) {
        const selectProxy = database.prepare('SELECT * FROM "proxies" WHERE id = ?')
        proxy = selectProxy.get(instance.proxyId) as ProxyConfig | undefined
      }

      return { name: instance.name, proxy: proxy }
    })

    return transaction()
  }

  public addInstance(options: MinecraftInstanceConfig): void {
    const database = this.sqliteManager.getDatabase()
    const transaction = database.transaction(() => {
      const proxy = database.prepare(
        'INSERT INTO "proxies" (protocol, host, port, user, password) VALUES (?, ?, ?, ?, ?)'
      )
      let proxyId: number | bigint | undefined
      if (options.proxy !== undefined) {
        proxyId = proxy.run(
          options.proxy.protocol,
          options.proxy.host,
          options.proxy.port,
          options.proxy.user,
          options.proxy.password
        ).lastInsertRowid
      }

      const instance = database.prepare('INSERT INTO "mojangInstances" (name, proxyId) VALUES (?, ?)')
      instance.run(options.name, proxyId)
    })

    transaction()
  }

  public deleteInstance(instanceName: string): number {
    const database = this.sqliteManager.getDatabase()
    const transaction = database.transaction(() => {
      const instance = this.getInstance(instanceName)
      if (instance == undefined) return 0

      const statement = database.prepare('DELETE FROM "mojangInstances" WHERE name = ?')
      const result = statement.run(instance.name).changes
      if (result !== 0) {
        this.logger.debug(`Deleted Minecraft instance with the name=${instanceName}`)
      }

      if (instance.proxy !== undefined) {
        const statement = database.prepare('DELETE FROM "proxies" WHERE id = ?')
        const result = statement.run(instance.proxy.id).changes
        if (result !== 0) {
          this.logger.debug(
            `Deleted related proxy with the id=${instance.proxy.id} to the Minecraft instance with the name=${instanceName}`
          )
        }
      }

      return result
    })

    return transaction()
  }

  /**
   * Import Microsoft authentication cache from JSON data.
   * The JSON should be an object where keys are cache names (e.g., "token", "mca", "userToken", etc.)
   * and values are the cache data objects.
   *
   * @param instanceName The Minecraft instance name
   * @param username The username for the session (typically the instance name)
   * @param jsonData JSON string or object containing cache data
   * @returns Object with imported cache names and any errors
   */
  public importAuthCache(
    instanceName: string,
    username: string,
    jsonData: string | Record<string, unknown>
  ): { imported: string[]; errors: string[] } {
    const imported: string[] = []
    const errors: string[] = []

    try {
      // Parse JSON if it's a string
      const parsedData =
        typeof jsonData === 'string' ? (JSON.parse(jsonData) as Record<string, unknown>) : jsonData

      if (typeof parsedData !== 'object' || parsedData === null || Array.isArray(parsedData)) {
        errors.push('Invalid JSON format: expected an object with cache entries')
        return { imported, errors }
      }

      // Import each cache entry
      for (const [cacheName, cacheValue] of Object.entries(parsedData)) {
        try {
          if (typeof cacheValue !== 'object' || cacheValue === null) {
            errors.push(`Skipping invalid cache entry "${cacheName}": value must be an object`)
            continue
          }

          this.setSession(instanceName, username, cacheName, cacheValue as Record<string, unknown>)
          imported.push(cacheName)
          this.logger.debug(`Imported cache "${cacheName}" for instance "${instanceName}"`)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          errors.push(`Failed to import cache "${cacheName}": ${errorMessage}`)
          this.logger.warn(`Failed to import cache "${cacheName}" for instance "${instanceName}":`, error)
        }
      }

      if (imported.length > 0) {
        this.logger.info(
          `Imported ${imported.length} cache entries for instance "${instanceName}": ${imported.join(', ')}`
        )
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      errors.push(`Failed to parse JSON: ${errorMessage}`)
      this.logger.error(`Failed to import auth cache for instance "${instanceName}":`, error)
    }

    return { imported, errors }
  }
}

interface MojangInstance {
  name: string
  proxyId: number | undefined
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
    private readonly sqliteManager: SqliteManager,
    private readonly logger: Logger,
    readonly instanceName: string,
    readonly name: string,
    readonly cacheName: string
  ) {}

  async reset(): Promise<void> {
    await Promise.resolve() // require async/await per interface definition

    const database = this.sqliteManager.getDatabase()
    const statement = database.prepare('DELETE FROM "mojangSessions" WHERE name = ? AND cacheName = ?')
    const result = statement.run(this.name, this.cacheName).changes
    if (result !== 0) {
      this.logger.debug(`Deleted sessions for name=${this.name} and cacheName=${this.cacheName}`)
    }
  }

  async getCached(): Promise<Record<string, unknown>> {
    await Promise.resolve() // require async/await per interface definition
    return this.getCacheSync()
  }

  private getCacheSync(): Record<string, unknown> {
    const database = this.sqliteManager.getDatabase()
    const statement = database.prepare('SELECT value FROM "mojangSessions" WHERE name = ? AND cacheName = ?')
    const result = statement.pluck(true).get(this.name, this.cacheName) as string | undefined
    return result === undefined ? {} : (JSON.parse(result) as Record<string, unknown>)
  }

  async setCached(value: Record<string, unknown>): Promise<void> {
    await Promise.resolve() // require async/await per interface definition
    this.setCachedSync(value)
  }

  private setCachedSync(value: Record<string, unknown>): void {
    this.sessionsManager.setSession(this.instanceName, this.name, this.cacheName, value)
  }

  async setCachedPartial(value: Record<string, unknown>): Promise<void> {
    await Promise.resolve() // require async/await per interface definition

    const transaction = this.sqliteManager.getDatabase().transaction(() => {
      const partial = this.getCacheSync()
      this.setCachedSync({ partial, ...value })
    })

    transaction()
  }
}
