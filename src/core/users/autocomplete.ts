import assert from 'node:assert'

import type { Logger } from 'log4js'

import type Application from '../../application.js'
import { InstanceType } from '../../common/application-event.js'
import { Status } from '../../common/connectable-instance.js'
import type EventHelper from '../../common/event-helper.js'
import type { PostgresManager } from '../../common/postgres-manager.js'
import SubInstance from '../../common/sub-instance.js'
import type UnexpectedErrorHandler from '../../common/unexpected-error-handler.js'
import Duration from '../../utility/duration.js'
import type { Core } from '../core.js'

export default class Autocomplete extends SubInstance<Core, InstanceType.Core, void> {
  private static readonly MaxLife = Duration.years(1)

  // In-memory cache for synchronous access
  private usernamesCache: string[] = []
  private ranksCache: string[] = []
  private cacheLoaded = false

  constructor(
    application: Application,
    clientInstance: Core,
    eventHelper: EventHelper<InstanceType.Core>,
    logger: Logger,
    errorHandler: UnexpectedErrorHandler,
    private readonly postgresManager: PostgresManager
  ) {
    super(application, clientInstance, eventHelper, logger, errorHandler)

    // Load cache on startup
    void this.loadCache()

    application.on('chat', (event) => {
      void this.addUsernames([event.user.displayName()])
    })
    application.on('guildPlayer', (event) => {
      void this.addUsernames([event.user.mojangProfile().name])
    })
    application.on('command', (event) => {
      void this.addUsernames([event.user.displayName()])
    })
    application.on('commandFeedback', (event) => {
      void this.addUsernames([event.user.displayName()])
    })

    setInterval(() => {
      void this.fetchGuildInfo().catch(this.errorHandler.promiseCatch('fetching guild info for autocomplete'))
    }, 60_000)

    const ranksResolver = setTimeout(() => {
      void this.resolveGuildRanks().catch(this.errorHandler.promiseCatch('resolving guild ranks'))
    }, 10 * 1000)
    application.on('minecraftSelfBroadcast', (): void => {
      ranksResolver.refresh()
    })
    application.on('instanceAnnouncement', (event): void => {
      if (event.instanceType === InstanceType.Minecraft) {
        ranksResolver.refresh()
      }
    })

    this.postgresManager.registerCleaner(async () => {
      const oldestTimestamp = Date.now() - Autocomplete.MaxLife.toMilliseconds()
      let count = 0

      const r1 = await this.postgresManager.execute(
        'DELETE FROM "autocompleteUsernames" WHERE timestamp < $1',
        [Math.floor(oldestTimestamp / 1000)]
      )
      count += r1

      const r2 = await this.postgresManager.execute(
        'DELETE FROM "autocompleteRanks" WHERE timestamp < $1',
        [Math.floor(oldestTimestamp / 1000)]
      )
      count += r2

      if (count > 0) this.logger.debug(`Deleted ${count} old autocomplete entry`)
    })
  }

  private async loadCache(): Promise<void> {
    const usernames = await this.postgresManager.query<{ content: string }>(
      'SELECT content FROM "autocompleteUsernames"'
    )
    this.usernamesCache = usernames.map((r) => r.content)

    const ranks = await this.postgresManager.query<{ content: string }>('SELECT content FROM "autocompleteRanks"')
    this.ranksCache = ranks.map((r) => r.content)

    this.cacheLoaded = true
  }

  public username(query: string, limit: number): string[] {
    return this.fetchFromCache(this.usernamesCache, query, limit)
  }

  public rank(query: string, limit: number): string[] {
    return this.fetchFromCache(this.ranksCache, query, limit)
  }

  private fetchFromCache(cache: string[], query: string, limit: number): string[] {
    assert.ok(limit >= 1, 'limit must be 1 or greater')
    limit = Math.floor(limit)

    if (!this.cacheLoaded) return []

    const lowerQuery = query.toLowerCase()
    const result: string[] = []

    // First, find entries that start with the query
    for (const entry of cache) {
      if (entry.toLowerCase().startsWith(lowerQuery)) {
        result.push(entry)
        if (result.length >= limit) break
      }
    }

    if (result.length >= limit) {
      return result.slice(0, limit)
    }

    // Then, find entries that contain the query
    const resultSet = new Set(result)
    for (const entry of cache) {
      if (!resultSet.has(entry) && entry.toLowerCase().includes(lowerQuery)) {
        result.push(entry)
        if (result.length >= limit) break
      }
    }

    return result.slice(0, limit)
  }

  private async addUsernames(usernames: string[]): Promise<void> {
    await this.add('autocompleteUsernames', usernames)
    // Update cache
    for (const username of usernames) {
      const trimmed = username.trim()
      if (!this.usernamesCache.includes(trimmed)) {
        this.usernamesCache.push(trimmed)
      }
    }
  }

  private async addRanks(ranks: string[]): Promise<void> {
    await this.add('autocompleteRanks', ranks)
    // Update cache
    for (const rank of ranks) {
      const trimmed = rank.trim()
      if (!this.ranksCache.includes(trimmed)) {
        this.ranksCache.push(trimmed)
      }
    }
  }

  private async add(table: string, entries: string[]): Promise<void> {
    await this.postgresManager.withTransaction(async (client) => {
      for (const entry of entries) {
        await client.query(
          `INSERT INTO "${table}" ("loweredContent", content, timestamp)
           VALUES ($1, $2, $3)
           ON CONFLICT ("loweredContent") DO UPDATE SET
             content = EXCLUDED.content,
             timestamp = EXCLUDED.timestamp`,
          [entry.toLowerCase().trim(), entry.trim(), Math.floor(Date.now() / 1000)]
        )
      }
    })
  }

  private async fetchGuildInfo(): Promise<void> {
    const tasks = []
    const usernames: string[] = []
    const ranks: string[] = []

    for (const instance of this.application.minecraftManager.getAllInstances()) {
      if (instance.currentStatus() !== Status.Connected) continue

      const task = this.application.core.guildManager
        .list(instance.instanceName, Duration.minutes(1))
        .then((guild) => {
          for (const member of guild.members) {
            usernames.push(member.username)
            ranks.push(member.rank)
          }
        })
        .catch(() => undefined)

      tasks.push(task)
    }

    await Promise.all(tasks)

    await this.addUsernames(usernames)
    await this.addRanks(ranks)
  }

  private async resolveGuildRanks(): Promise<void> {
    this.logger.debug('Resolving guild ranks from server')

    const guildsResolver = this.application.minecraftManager
      .getMinecraftBots()
      .map((bots) => bots.uuid)
      .map((uuid) => this.application.hypixelApi.getGuild('player', uuid).catch(() => undefined))

    const guilds = await Promise.all(guildsResolver)
    const ranks: string[] = []
    for (const guild of guilds) {
      if (guild === undefined) continue

      for (const rank of guild.ranks) {
        ranks.push(rank.name)
      }
    }

    await this.addRanks(ranks)
  }
}
