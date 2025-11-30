import assert from 'node:assert'

import NodeCache from 'node-cache'

import type { PostgresManager } from '../common/postgres-manager.js'
import Duration from '../utility/duration.js'

interface ConfigurationRow {
  category: string
  name: string
  value: string
}

export class ConfigurationsManager {
  private static readonly Tablename = 'configurations'
  private readonly createdCategories = new Map<string, Configuration>()

  // Global cache for all configurations - loaded at startup
  private readonly globalCache = new Map<string, Map<string, string>>()
  private initialized = false

  constructor(private readonly postgresManager: PostgresManager) {}

  /**
   * Initialize the configurations manager by loading all configurations from the database.
   * This MUST be called before any Configuration objects are used.
   */
  public async init(): Promise<void> {
    if (this.initialized) return

    const rows = await this.postgresManager.query<ConfigurationRow>(
      `SELECT category, name, value FROM "${ConfigurationsManager.Tablename}"`
    )

    for (const row of rows) {
      let categoryCache = this.globalCache.get(row.category)
      if (!categoryCache) {
        categoryCache = new Map()
        this.globalCache.set(row.category, categoryCache)
      }
      categoryCache.set(row.name, row.value)
    }

    this.initialized = true
  }

  public create(category: string): Configuration {
    assert.ok(this.initialized, 'ConfigurationsManager must be initialized before creating configurations')
    assert.ok(
      !this.createdCategories.has(category),
      'Category is already created and given out. Reuse the object if needed. Objects will not be given again to avoid race conditions.'
    )

    // Ensure category cache exists
    if (!this.globalCache.has(category)) {
      this.globalCache.set(category, new Map())
    }

    const config = new Configuration(
      this.postgresManager,
      ConfigurationsManager.Tablename,
      category,
      this.globalCache.get(category)!
    )
    this.createdCategories.set(category, config)
    return config
  }
}

export class Configuration {
  private static readonly CacheDuration = Duration.minutes(2)

  // Local cache for this category with TTL (for backwards compatibility)
  private readonly localCache = new NodeCache({ stdTTL: Configuration.CacheDuration.toSeconds() })

  constructor(
    private readonly postgresManager: PostgresManager,
    private readonly tablename: string,
    private readonly category: string,
    private readonly categoryCache: Map<string, string>
  ) {}

  public getStringArray(name: string, defaultValue: string[]): string[] {
    return this.get(name, defaultValue, (raw) => JSON.parse(raw) as string[])
  }

  public setStringArray(name: string, value: string[]): void {
    this.persist(name, value, (data) => JSON.stringify(data))
  }

  public getString(name: string, defaultValue: string): string {
    return this.get(name, defaultValue)
  }

  public setString(name: string, value: string): void {
    this.persist(name, value)
  }

  public getNumber(name: string, defaultValue: number): number {
    return this.get(name, defaultValue, (raw: string | number) =>
      typeof raw === 'number' ? raw : Number.parseInt(raw, 10)
    )
  }

  public setNumber(name: string, value: number): void {
    this.persist(name, value)
  }

  public getBoolean(name: string, defaultValue: boolean): boolean {
    return this.get(name, defaultValue, (raw) => raw === '1')
  }

  public setBoolean(name: string, value: boolean): void {
    this.persist(name, value, (data) => (data ? '1' : '0'))
  }

  public delete(name: string): void {
    this.localCache.del(name)
    this.categoryCache.delete(name)

    void this.postgresManager
      .execute(
        `DELETE FROM "${this.tablename}" WHERE category = $1 AND name = $2`,
        [this.category, name]
      )
      .catch((error) => {
        // Keep visibility on persistence failures while preserving the sync API
        console.error(`[Configurations] Failed to delete ${this.category}.${name}`, error)
      })
  }

  /**
   * Synchronous getter - reads from cache only.
   * Cache is populated at startup via ConfigurationsManager.init()
   */
  private get<T>(name: string, defaultValue: T, deserialize?: (raw: string) => T): T {
    // Check local cache first (for recently set values)
    const localCached = this.localCache.get<T>(name)
    if (localCached !== undefined) return localCached

    // Check global category cache (loaded at startup)
    const rawValue = this.categoryCache.get(name)
    if (rawValue === undefined) {
      return defaultValue
    }

    let value: T
    if (deserialize === undefined) {
      value = rawValue as unknown as T
    } else {
      value = deserialize(rawValue)
    }

    // Store in local cache for faster subsequent access
    this.localCache.set(name, value)
    return value
  }

  /**
   * Async setter - updates cache synchronously, then writes to database asynchronously.
   * This keeps the API synchronous for callers while ensuring data persistence.
   */
  private async set<T>(name: string, value: T, serialize?: (value: T) => string): Promise<void> {
    const serializedValue = serialize === undefined ? String(value) : serialize(value)

    // Update caches synchronously
    this.localCache.set(name, value)
    this.categoryCache.set(name, serializedValue)

    // Write to database asynchronously
    await this.postgresManager.execute(
      `INSERT INTO "${this.tablename}" (category, name, value, "lastUpdatedAt")
       VALUES ($1, $2, $3, FLOOR(EXTRACT(EPOCH FROM NOW())))
       ON CONFLICT (category, name) DO UPDATE SET
         value = EXCLUDED.value,
         "lastUpdatedAt" = FLOOR(EXTRACT(EPOCH FROM NOW()))`,
      [this.category, name, serializedValue]
    )
  }

  /**
   * Fire-and-forget wrapper that logs write failures so callers can remain synchronous.
   */
  private persist<T>(name: string, value: T, serialize?: (value: T) => string): void {
    void this.set(name, value, serialize).catch((error) => {
      console.error(`[Configurations] Failed to persist ${this.category}.${name}`, error)
    })
  }
}
