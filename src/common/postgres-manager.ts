import assert from 'node:assert'

import type { Logger } from 'log4js'
import type { Pool, PoolClient } from 'pg'
import pg from 'pg'

import type Application from '../application.js'

export class PostgresManager {
  private static readonly CleanEvery = 3 * 60 * 60 * 1000
  private static readonly SchemaVersionTable = 'schema_version'

  private readonly pool: Pool
  private newlyCreated = false

  private closed = false

  private lastClean = -1
  private cleanCallbacks: (() => Promise<void> | void)[] = []

  private readonly migrators = new Map<number, Migrator>()
  private targetVersion = 0

  public constructor(
    private readonly application: Application,
    private readonly logger: Logger,
    connectionString: string
  ) {
    this.pool = new pg.Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    })

    application.addShutdownListener(() => {
      void this.close()
    })
  }

  public async initialize(): Promise<void> {
    // Check if schema_version table exists to determine if this is a new database
    const client = await this.pool.connect()
    try {
      const result = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )`,
        [PostgresManager.SchemaVersionTable]
      )
      const exists = Boolean(result.rows[0]?.exists)
      let hasRow = false
      if (exists) {
        const countResult = await client.query(
          `SELECT COUNT(*) AS count FROM "${PostgresManager.SchemaVersionTable}" WHERE id = 1`
        )
        hasRow = Number(countResult.rows[0]?.count ?? 0) > 0
      }
      this.newlyCreated = !exists || !hasRow

      // Create schema_version table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${PostgresManager.SchemaVersionTable}" (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          version INTEGER NOT NULL DEFAULT 0,
          updated_at BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))
        )
      `)

      // Insert initial version if table is empty
      await client.query(`
        INSERT INTO "${PostgresManager.SchemaVersionTable}" (id, version)
        VALUES (1, 0)
        ON CONFLICT (id) DO NOTHING
      `)
    } finally {
      client.release()
    }
  }

  public isNewlyCreated(): boolean {
    return this.newlyCreated
  }

  public registerCleaner(callback: () => Promise<void> | void): void {
    this.cleanCallbacks.push(callback)
  }

  public registerMigrator(version: number, migrate: Migrator): this {
    assert.ok(!this.migrators.has(version), `migration process for version ${version} already registered.`)
    this.migrators.set(version, migrate)

    return this
  }

  public setTargetVersion(version: number): this {
    this.targetVersion = version

    return this
  }

  public async migrate(): Promise<void> {
    const client = await this.pool.connect()
    const postCleanupActions: (() => void)[] = []

    try {
      await client.query('BEGIN')

      const newlyCreated = this.isNewlyCreated()

      let finished = false
      let changed = false
      while (!finished) {
        const versionResult = await client.query(
          `SELECT version FROM "${PostgresManager.SchemaVersionTable}" WHERE id = 1`
        )
        const currentVersion = versionResult.rows[0]?.version ?? 0

        const migrator = this.migrators.get(currentVersion)
        if (migrator !== undefined) {
          await migrator(client, this.logger, postCleanupActions, newlyCreated)
          changed = true
          continue
        }

        assert.strictEqual(
          currentVersion,
          this.targetVersion,
          'migration process failed to reach the target version somehow??'
        )

        if (changed && !newlyCreated) {
          this.logger.debug('Database schema has been migrated successfully')
        }

        this.logger.info('Database schema is on latest version')
        finished = true
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    if (postCleanupActions.length > 0) {
      this.logger.debug('Starting cleaning up...')

      for (const postAction of postCleanupActions) {
        postAction()
      }

      this.logger.debug('Finished all cleanups.')
    }
  }

  public async close(): Promise<void> {
    this.closed = true
    await this.pool.end()
  }

  public isClosed(): boolean {
    return this.closed
  }

  public getPool(): Pool {
    assert.ok(!this.isClosed(), 'Database is closed')
    void this.tryClean()
    return this.pool
  }

  public async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]> {
    const result = await this.pool.query(sql, params)
    return result.rows as T[]
  }

  public async queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T | undefined> {
    const result = await this.pool.query(sql, params)
    return result.rows[0] as T | undefined
  }

  public async execute(sql: string, params?: unknown[]): Promise<number> {
    const result = await this.pool.query(sql, params)
    return result.rowCount ?? 0
  }

  public async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  private async tryClean(): Promise<void> {
    const currentTime = Date.now()

    if (this.lastClean + PostgresManager.CleanEvery > currentTime) return
    this.lastClean = currentTime
    for (const cleanCallback of this.cleanCallbacks) {
      await cleanCallback()
    }
  }
}

export type Migrator = (
  client: PoolClient,
  logger: Logger,
  postCleanupActions: (() => void)[],
  newlyCreated: boolean
) => Promise<void>
