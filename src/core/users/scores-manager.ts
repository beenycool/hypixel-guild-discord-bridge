import assert from 'node:assert'

import type { Logger } from 'log4js'
import PromiseQueue from 'promise-queue'

import type Application from '../../application.js'
import { ChannelType, InstanceType } from '../../common/application-event.js'
import { Status } from '../../common/connectable-instance.js'
import type EventHelper from '../../common/event-helper.js'
import type { PostgresManager } from '../../common/postgres-manager.js'
import SubInstance from '../../common/sub-instance.js'
import type UnexpectedErrorHandler from '../../common/unexpected-error-handler.js'
import Duration from '../../utility/duration.js'
import type { Core } from '../core.js'

export default class ScoresManager extends SubInstance<Core, InstanceType.Core, void> {
  public static readonly DeleteMembersOlderThan = Duration.years(3)
  public static readonly DeleteMessagesOlderThan = Duration.years(3)
  public static readonly LeniencyTime = Duration.minutes(5)

  private static readonly InstantInterval = 60 * 1000
  private static readonly FetchMembersEvery = 50 * 1000

  private static readonly ScoresExpireAt = Duration.minutes(1)

  private cachedPoints30Days: ActivityTotalPoints[] | undefined
  private lastUpdatePoints30Days = -1

  private cachedPointsAlltime: ActivityTotalPoints[] | undefined
  private lastUpdatePointsAlltime = -1

  private readonly queue = new PromiseQueue(1)
  private readonly database: ScoreDatabase

  constructor(
    application: Application,
    clientInstance: Core,
    eventHelper: EventHelper<InstanceType.Core>,
    logger: Logger,
    errorHandler: UnexpectedErrorHandler,
    postgresManager: PostgresManager
  ) {
    super(application, clientInstance, eventHelper, logger, errorHandler)

    this.database = new ScoreDatabase(this, postgresManager)

    this.application.on('minecraftSelfBroadcast', (event) => {
      void this.database.addBotUuid(event.uuid)
    })

    this.application.on('chat', (event) => {
      if (event.channelType !== ChannelType.Public) return

      switch (event.instanceType) {
        case InstanceType.Discord: {
          void this.database.addDiscordMessage(event.user.discordProfile().id, this.timestamp())
          break
        }
        case InstanceType.Minecraft: {
          void this.database.addMinecraftMessage(event.user.mojangProfile().id, this.timestamp())
        }
      }
    })

    this.application.on('command', (event) => {
      if (event.channelType !== ChannelType.Public) return

      switch (event.instanceType) {
        case InstanceType.Discord: {
          const profile = event.user.discordProfile()
          void this.database.addDiscordCommand(profile.id, this.timestamp())
          break
        }
        case InstanceType.Minecraft: {
          const profile = event.user.mojangProfile()
          void this.database.addMinecraftCommand(profile.id, this.timestamp())
        }
      }
    })

    setInterval(() => {
      void this.queue
        .add(async () => {
          await this.fetchGuilds()
        })
        .catch(this.errorHandler.promiseCatch('fetching guilds'))
    }, Duration.minutes(30).toMilliseconds())

    setInterval(() => {
      void this.queue
        .add(async () => {
          await this.fetchMembers()
        })
        .catch(this.errorHandler.promiseCatch('fetching and adding members'))
    }, ScoresManager.FetchMembersEvery)

    setInterval(() => {
      void this.migrateUsernames().catch(this.errorHandler.promiseCatch('migrating Mojang usernames to UUID'))
    }, Duration.minutes(30).toMilliseconds())
  }

  public async getMessages30Days(): Promise<TotalMessagesLeaderboard[]> {
    const currentDate = Date.now()
    const ignores = await this.database.getBotUuids()
    return this.database.getGuildMessagesLeaderboard(ignores, currentDate - 30 * 24 * 60 * 60 * 1000, currentDate)
  }

  public async getMinecraftMessages30Days(limit: number): Promise<{ top: MessagesLeaderboard[]; total: number }> {
    const currentDate = Date.now()
    const ignores = await this.database.getBotUuids()
    return this.database.getMinecraftMessages(ignores, currentDate - 30 * 24 * 60 * 60 * 1000, currentDate, limit)
  }

  public async getDiscordMessages30Days(userIds: string[]): Promise<MessagesLeaderboard[]> {
    const currentDate = Date.now()
    return this.database.getDiscordMessages(userIds, currentDate - 30 * 24 * 60 * 60 * 1000, currentDate)
  }

  public async getOnline30Days(): Promise<MemberLeaderboard[]> {
    const currentDate = Date.now()
    const ignores = await this.database.getBotUuids()
    return this.database.getTime('OnlineMembers', ignores, currentDate - 30 * 24 * 60 * 60 * 1000, currentDate)
  }

  public async getPoints30Days(): Promise<ActivityTotalPoints[]> {
    if (
      this.cachedPoints30Days !== undefined &&
      this.lastUpdatePoints30Days + ScoresManager.ScoresExpireAt.toMilliseconds() > Date.now()
    ) {
      return this.cachedPoints30Days
    }

    const currentDate = Date.now()
    const points = await this.database.getPoints(currentDate - Duration.days(30).toMilliseconds(), currentDate)
    const leaderboard = await this.normalizePoints(points)

    this.cachedPoints30Days = leaderboard
    this.lastUpdatePoints30Days = Date.now()

    return leaderboard
  }

  public async getPointsAlltime(): Promise<ActivityTotalPoints[]> {
    if (
      this.cachedPointsAlltime !== undefined &&
      this.lastUpdatePointsAlltime + ScoresManager.ScoresExpireAt.toMilliseconds() > Date.now()
    ) {
      return this.cachedPointsAlltime
    }

    const points = await this.database.getPoints(0, Date.now())
    const leaderboard = await this.normalizePoints(points)

    this.cachedPointsAlltime = leaderboard
    this.lastUpdatePointsAlltime = Date.now()

    return leaderboard
  }

  private async normalizePoints(points: Map<string, ActivityTotalPoints>): Promise<ActivityTotalPoints[]> {
    for (const minecraftBotUuid of await this.database.getBotUuids()) {
      points.delete(minecraftBotUuid)
    }
    for (const minecraftBot of this.application.minecraftManager.getMinecraftBots()) {
      points.delete(minecraftBot.uuid)
    }

    const leaderboard = [...points.values()]
    for (const currentScore of leaderboard) {
      currentScore.total = Math.floor(currentScore.total)
    }
    leaderboard.sort((a, b) => b.total - a.total)

    return leaderboard
  }

  private async fetchGuilds(): Promise<void> {
    for (const instance of this.application.minecraftManager.getAllInstances()) {
      const botUuid = instance.uuid()
      if (botUuid === undefined) continue
      this.logger.trace(`Fetching guild members for bot uuid ${botUuid}`)

      const guild = await this.application.hypixelApi.getGuild('player', botUuid)
      const timeframes: Timeframe[] = []
      const currentTimestamp = Date.now()
      for (const member of guild.members) {
        timeframes.push({
          uuid: member.uuid,
          fromTimestamp: member.joinedAtTimestamp,
          toTimestamp: currentTimestamp,
          leniencyMilliseconds: ScoresManager.LeniencyTime.toMilliseconds()
        })
      }
      this.logger.trace(`Supplementing ${timeframes.length} guild members timeframe data for bot uuid ${botUuid}`)
      await this.database.addMembers(timeframes)
    }
  }

  private async fetchMembers(): Promise<void> {
    const instances = this.application.minecraftManager.getAllInstances()
    for (const bot of this.application.minecraftManager.getMinecraftBots()) {
      await this.database.addBotUuid(bot.uuid)
    }

    const tasks: Promise<unknown>[] = []

    for (const instance of instances) {
      const botUuid = instance.uuid()
      if (botUuid !== undefined) await this.database.addBotUuid(botUuid)

      if (instance.currentStatus() === Status.Connected) {
        const onlineTask = this.application.core.guildManager
          .list(instance.instanceName)
          .then((guild) => guild.members.filter((member) => member.online).map((member) => member.username))
          .then((usernames) => this.application.mojangApi.profilesByUsername(new Set(usernames)))
          .then(async (profiles) => {
            const uuids = [...profiles.values()].filter((uuid) => uuid !== undefined)
            const currentTime = Date.now()
            const entries: Timeframe[] = uuids.map((uuid) => ({
              uuid: uuid,
              fromTimestamp: currentTime,
              toTimestamp: currentTime,
              leniencyMilliseconds: ScoresManager.LeniencyTime.toMilliseconds()
            }))
            await this.database.addOnlineMembers(entries)
          })
          .catch(this.errorHandler.promiseCatch('fetching and adding online members'))

        const allTask = this.application.core.guildManager
          .list(instance.instanceName)
          .then((guild) => guild.members.map((member) => member.username))
          .then((usernames) => this.application.mojangApi.profilesByUsername(new Set(usernames)))
          .then(async (profiles) => {
            const uuids = [...profiles.values()].filter((uuid) => uuid !== undefined)
            const currentTime = Date.now()
            const entries: Timeframe[] = uuids.map((uuid) => ({
              uuid: uuid,
              fromTimestamp: currentTime,
              toTimestamp: currentTime,
              leniencyMilliseconds: ScoresManager.LeniencyTime.toMilliseconds()
            }))
            await this.database.addMembers(entries)
          })
          .catch(this.errorHandler.promiseCatch('fetching and adding all members'))

        tasks.push(onlineTask, allTask)
      }
    }

    await Promise.all(tasks)
  }

  private async migrateUsernames(): Promise<void> {
    /**
     * Only migrate from the last 30 days since Mojang locks username for up to 30 days before releasing it to the public
     * Within 30 days period, there won't be conflict between players UUID
     */
    const oldestTimestamp = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60

    const usernames = await this.database.getLegacyUsernames(oldestTimestamp)
    if (usernames.size === 0) return
    this.logger.debug(`Found ${usernames.size} legacy username that requires migration`)

    const resolvedProfiles = await this.application.mojangApi.profilesByUsername(usernames)
    const entries: { username: string; uuid: string }[] = []
    for (const [username, uuid] of resolvedProfiles.entries()) {
      if (uuid === undefined) continue
      entries.push({ username, uuid })
    }

    if (entries.length < usernames.size) {
      this.logger.debug(`No Mojang information found for ${usernames.size - entries.length} username. Skipping those.`)
    }

    const changedCount = await this.database.migrateUsernameToUuid(oldestTimestamp, entries)
    if (changedCount > 0) {
      this.logger.debug(`Migrated ${changedCount} database entry from Mojang username to UUID`)
    }
  }

  private timestamp(): number {
    const currentTime = Date.now()
    const remaining = currentTime % ScoresManager.InstantInterval
    return currentTime - remaining
  }
}

class ScoreDatabase {
  constructor(
    private readonly scoresManager: ScoresManager,
    private readonly postgresManager: PostgresManager
  ) {
    postgresManager.registerCleaner(async () => {
      await this.clean()
    })
  }

  public async addMinecraftCommand(uuid: string, timestamp: number): Promise<void> {
    const result = await this.postgresManager.execute(
      `INSERT INTO "MinecraftCommands" (timestamp, "user", count)
       VALUES ($1, $2, 1)
       ON CONFLICT (timestamp, "user") DO UPDATE SET count = "MinecraftCommands".count + 1`,
      [Math.floor(timestamp / 1000), uuid]
    )
    assert.ok(result > 0, 'Nothing changed even when inserted?')
  }

  public async addDiscordCommand(id: string, timestamp: number): Promise<void> {
    const result = await this.postgresManager.execute(
      `INSERT INTO "DiscordCommands" (timestamp, "user", count)
       VALUES ($1, $2, 1)
       ON CONFLICT (timestamp, "user") DO UPDATE SET count = "DiscordCommands".count + 1`,
      [Math.floor(timestamp / 1000), id]
    )
    assert.ok(result > 0, 'Nothing changed even when inserted?')
  }

  public async addMinecraftMessage(uuid: string, timestamp: number): Promise<void> {
    const result = await this.postgresManager.execute(
      `INSERT INTO "MinecraftMessages" (timestamp, "user", count)
       VALUES ($1, $2, 1)
       ON CONFLICT (timestamp, "user") DO UPDATE SET count = "MinecraftMessages".count + 1`,
      [Math.floor(timestamp / 1000), uuid]
    )
    assert.ok(result > 0, 'Nothing changed even when inserted?')
  }

  public async getMinecraftMessages(
    ignore: string[],
    from: number,
    to: number,
    limit: number
  ): Promise<{
    top: MessagesLeaderboard[]
    total: number
  }> {
    let ignoreClause = ''
    const params: unknown[] = []
    let paramIndex = 1

    if (ignore.length > 0) {
      const placeholders = ignore.map(() => `$${paramIndex++}`).join(',')
      ignoreClause = `"user" NOT IN (${placeholders}) AND `
      params.push(...ignore)
    }

    const fromParam = paramIndex++
    const toParam = paramIndex++
    const limitParam = paramIndex++
    params.push(Math.floor(from / 1000), Math.floor(to / 1000))

    const topResult = await this.postgresManager.query<{ user: string; total: string }>(
      `SELECT "user", SUM(count) as total FROM "MinecraftMessages"
       WHERE ${ignoreClause}timestamp BETWEEN $${fromParam} AND $${toParam}
       GROUP BY "user" ORDER BY total DESC LIMIT $${limitParam}`,
      [...params, limit]
    )

    const totalResult = await this.postgresManager.queryOne<{ total: string }>(
      `SELECT SUM(count) as total FROM "MinecraftMessages"
       WHERE ${ignoreClause}timestamp BETWEEN $${fromParam} AND $${toParam}`,
      params
    )

    return {
      top: topResult.map((r) => ({ user: r.user, total: Number(r.total) })),
      total: Number(totalResult?.total ?? 0)
    }
  }

  public async getDiscordMessages(userIds: string[], from: number, to: number): Promise<MessagesLeaderboard[]> {
    if (userIds.length === 0) return []

    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',')
    const fromParam = userIds.length + 1
    const toParam = userIds.length + 2

    const result = await this.postgresManager.query<{ user: string; total: string }>(
      `SELECT "user", SUM(count) as total FROM "DiscordMessages"
       WHERE "user" IN (${placeholders}) AND timestamp BETWEEN $${fromParam} AND $${toParam}
       GROUP BY "user" ORDER BY total DESC`,
      [...userIds, Math.floor(from / 1000), Math.floor(to / 1000)]
    )

    return result.map((r) => ({ user: r.user, total: Number(r.total) }))
  }

  public async getGuildMessagesLeaderboard(
    ignore: string[],
    from: number,
    to: number
  ): Promise<TotalMessagesLeaderboard[]> {
    return await this.postgresManager.withTransaction(async (client) => {
      let ignoreClause = ''
      const params: unknown[] = []
      let paramIndex = 1

      if (ignore.length > 0) {
        const placeholders = ignore.map(() => `$${paramIndex++}`).join(',')
        ignoreClause = `"MinecraftMessages"."user" NOT IN (${placeholders}) AND `
        params.push(...ignore)
      }

      const fromParam = paramIndex++
      const toParam = paramIndex++
      params.push(Math.floor(from / 1000), Math.floor(to / 1000))

      interface DatabaseEntry {
        uuid: string
        count: string
        discordId: string | null
      }

      const minecraftResult = await client.query<DatabaseEntry>(
        `SELECT "MinecraftMessages"."user" as uuid, links."discordId", count
         FROM "MinecraftMessages"
         LEFT JOIN links ON ("MinecraftMessages"."user" = links.uuid)
         WHERE ${ignoreClause}timestamp BETWEEN $${fromParam} AND $${toParam}`,
        params
      )

      // Reset params for discord query
      params.length = 0
      paramIndex = 1
      if (ignore.length > 0) {
        const placeholders = ignore.map(() => `$${paramIndex++}`).join(',')
        ignoreClause = `links.uuid NOT IN (${placeholders}) AND `
        params.push(...ignore)
      } else {
        ignoreClause = ''
      }
      const fromParam2 = paramIndex++
      const toParam2 = paramIndex++
      params.push(Math.floor(from / 1000), Math.floor(to / 1000))

      const discordResult = await client.query<DatabaseEntry>(
        `SELECT "DiscordMessages"."user" as "discordId", links.uuid, count
         FROM "DiscordMessages"
         JOIN links ON ("DiscordMessages"."user" = links."discordId")
         WHERE ${ignoreClause}timestamp BETWEEN $${fromParam2} AND $${toParam2}`,
        params
      )

      const leaderboard = new Map<string, TotalMessagesLeaderboard>()

      for (const entry of [...minecraftResult.rows, ...discordResult.rows]) {
        if (!entry.uuid) continue
        let object = leaderboard.get(entry.uuid)
        if (object === undefined) {
          object = { uuid: entry.uuid, discordId: entry.discordId ?? undefined, count: 0 }
          leaderboard.set(entry.uuid, object)
        }

        object.count += Number(entry.count)
      }

      const resultLeaderboard = [...leaderboard.values()]
      resultLeaderboard.sort((a, b) => b.count - a.count)
      return resultLeaderboard
    })
  }

  public async getTime(
    table: 'AllMembers' | 'OnlineMembers',
    ignore: string[],
    from: number,
    to: number
  ): Promise<MemberLeaderboard[]> {
    assert.ok(from < to, '"from" timestamp is earlier than the "to" timestamp')

    let ignoreClause = ''
    const paramValues: unknown[] = [Math.floor(from / 1000), Math.floor(to / 1000)]
    let paramIndex = 3

    if (ignore.length > 0) {
      const placeholders = ignore.map((_, i) => `$${paramIndex + i}`).join(',')
      ignoreClause = `"${table}".uuid NOT IN (${placeholders}) AND `
      paramValues.push(...ignore)
    }

    const result = await this.postgresManager.query<{ uuid: string; discordId: string | null; totaltime: string }>(
      `SELECT "${table}".uuid, links."discordId",
              SUM(LEAST($2, "toTimestamp") - GREATEST($1, "fromTimestamp")) as totalTime
       FROM "${table}"
       LEFT JOIN links ON ("${table}".uuid = links.uuid)
       WHERE ${ignoreClause}(("fromTimestamp" BETWEEN $1 AND $2) OR ("toTimestamp" BETWEEN $1 AND $2))
       GROUP BY "${table}".uuid, links."discordId"
       ORDER BY totalTime DESC`,
      paramValues
    )

    return result.map((entry) => ({
      uuid: entry.uuid,
      discordId: entry.discordId ?? undefined,
      totalTime: Number(entry.totaltime)
    }))
  }

  public async addDiscordMessage(id: string, timestamp: number): Promise<void> {
    const result = await this.postgresManager.execute(
      `INSERT INTO "DiscordMessages" (timestamp, "user", count)
       VALUES ($1, $2, 1)
       ON CONFLICT (timestamp, "user") DO UPDATE SET count = "DiscordMessages".count + 1`,
      [Math.floor(timestamp / 1000), id]
    )
    assert.ok(result > 0, 'Nothing changed even when inserted?')
  }

  public async addOnlineMembers(entries: Timeframe[]): Promise<void> {
    await this.appendTimeframe('OnlineMembers', entries)
  }

  public async addMembers(entries: Timeframe[]): Promise<void> {
    await this.appendTimeframe('AllMembers', entries)
  }

  /*
    Consolidate timeframes where from and to timestamps overlap (+ additional leniency when checking for overlapping)
   */
  private async appendTimeframe(tableName: string, entries: Timeframe[]): Promise<void> {
    await this.postgresManager.withTransaction(async (client) => {
      for (const entry of entries) {
        const uuid = entry.uuid
        const fromTimestamp = Math.floor(entry.fromTimestamp / 1000)
        const toTimestamp = Math.floor(entry.toTimestamp / 1000)
        const leniencySeconds = Math.floor(entry.leniencyMilliseconds / 1000)

        const existingFrames = await client.query<{ id: number; toTimestamp: string; fromTimestamp: string }>(
          `SELECT id, "fromTimestamp", "toTimestamp" FROM "${tableName}" WHERE
           uuid = $1
           AND (
             ("fromTimestamp" > $3 AND "fromTimestamp" - $3 <= $4) OR
             ("toTimestamp" < $2 AND $2 - "toTimestamp" <= $4) OR
             ("fromTimestamp" BETWEEN $2 AND $3) OR
             ("toTimestamp" BETWEEN $2 AND $3)
           )`,
          [uuid, fromTimestamp, toTimestamp, leniencySeconds]
        )

        if (existingFrames.rows.length > 0) {
          const ids = existingFrames.rows.map((f: { id: number }) => f.id)
          const placeholders = ids.map((_: number, i: number) => `$${i + 1}`).join(',')
          await client.query(`DELETE FROM "${tableName}" WHERE id IN (${placeholders})`, ids)

          let lowestTime = Math.min(Number(existingFrames.rows[0].fromTimestamp), fromTimestamp)
          let highestTime = Math.max(Number(existingFrames.rows[0].toTimestamp), toTimestamp)
          for (const frame of existingFrames.rows) {
            if (Number(frame.fromTimestamp) < lowestTime) lowestTime = Number(frame.fromTimestamp)
            if (Number(frame.toTimestamp) > highestTime) highestTime = Number(frame.toTimestamp)
          }

          await client.query(
            `INSERT INTO "${tableName}" (uuid, "fromTimestamp", "toTimestamp") VALUES ($1, $2, $3)`,
            [uuid, lowestTime, highestTime]
          )
        } else {
          await client.query(
            `INSERT INTO "${tableName}" (uuid, "fromTimestamp", "toTimestamp") VALUES ($1, $2, $3)`,
            [uuid, fromTimestamp, toTimestamp]
          )
        }
      }
    })
  }

  private async getMessagesPoints(from: number, to: number): Promise<Map<string, ActivityPoint>> {
    return await this.postgresManager.withTransaction(async (client) => {
      interface DatabaseCountEntry {
        uuid: string
        count: string
        discordId: string | null
        timestamp: string
      }

      const minecraftResult = await client.query<DatabaseCountEntry>(
        `SELECT "MinecraftMessages"."user" as uuid, links."discordId", count, "MinecraftMessages".timestamp
         FROM "MinecraftMessages"
         LEFT JOIN links ON ("MinecraftMessages"."user" = links.uuid)
         WHERE timestamp BETWEEN $1 AND $2`,
        [Math.floor(from / 1000), Math.floor(to / 1000)]
      )

      const discordResult = await client.query<DatabaseCountEntry>(
        `SELECT "DiscordMessages"."user" as "discordId", links.uuid, count, "DiscordMessages".timestamp
         FROM "DiscordMessages"
         JOIN links ON ("DiscordMessages"."user" = links."discordId")
         WHERE timestamp BETWEEN $1 AND $2`,
        [Math.floor(from / 1000), Math.floor(to / 1000)]
      )

      const allEntries = [...minecraftResult.rows, ...discordResult.rows].map((e) => ({
        uuid: e.uuid,
        discordId: e.discordId,
        count: Number(e.count),
        timestamp: Number(e.timestamp)
      }))

      const ScoreMaxHistory = Duration.minutes(3)
      const BaseScore = 30

      return this.calculateCount(allEntries, BaseScore, ScoreMaxHistory)
    })
  }

  private async getCommandsPoints(from: number, to: number): Promise<Map<string, ActivityPoint>> {
    return await this.postgresManager.withTransaction(async (client) => {
      interface DatabaseCountEntry {
        uuid: string
        count: string
        discordId: string | null
        timestamp: string
      }

      const minecraftResult = await client.query<DatabaseCountEntry>(
        `SELECT "MinecraftCommands"."user" as uuid, links."discordId", count, "MinecraftCommands".timestamp
         FROM "MinecraftCommands"
         LEFT JOIN links ON ("MinecraftCommands"."user" = links.uuid)
         WHERE timestamp BETWEEN $1 AND $2`,
        [Math.floor(from / 1000), Math.floor(to / 1000)]
      )

      const discordResult = await client.query<DatabaseCountEntry>(
        `SELECT "DiscordCommands"."user" as "discordId", links.uuid, count, "DiscordCommands".timestamp
         FROM "DiscordCommands"
         JOIN links ON ("DiscordCommands"."user" = links."discordId")
         WHERE timestamp BETWEEN $1 AND $2`,
        [Math.floor(from / 1000), Math.floor(to / 1000)]
      )

      const allEntries = [...minecraftResult.rows, ...discordResult.rows].map((e) => ({
        uuid: e.uuid,
        discordId: e.discordId,
        count: Number(e.count),
        timestamp: Number(e.timestamp)
      }))

      const ScoreMaxHistory = Duration.minutes(5)
      const BaseScore = 15

      return this.calculateCount(allEntries, BaseScore, ScoreMaxHistory)
    })
  }

  private calculateCount(
    allEntries: DatabaseCountEntry[],
    baseScore: number,
    scoreMaxHistory: Duration
  ): Map<string, ActivityPoint> {
    allEntries.sort((a, b) => a.timestamp - b.timestamp)

    const leaderboard = new Map<string, ActivityPoint>()
    const countHistory = new Map<string, number[]>()

    for (const entry of allEntries) {
      if (!entry.uuid) continue

      let activityEntry = leaderboard.get(entry.uuid)
      if (activityEntry === undefined) {
        activityEntry = { uuid: entry.uuid, discordId: entry.discordId ?? undefined, points: 0 }
        leaderboard.set(entry.uuid, activityEntry)
      }
      activityEntry.discordId ??= entry.discordId ?? undefined

      let countHistoryEntry = countHistory.get(entry.uuid)
      if (countHistoryEntry === undefined) {
        countHistoryEntry = []
        countHistory.set(entry.uuid, countHistoryEntry)
      } else {
        countHistoryEntry = countHistoryEntry.filter(
          (countHistory) => countHistory + scoreMaxHistory.toSeconds() > entry.timestamp
        )
        countHistory.set(entry.uuid, countHistoryEntry)
      }

      for (let counter = 0; counter < entry.count; counter++) {
        countHistoryEntry.push(entry.timestamp)

        const pointsIncrement = Math.max(1, baseScore / countHistoryEntry.length)
        activityEntry.points += pointsIncrement
      }
    }

    return leaderboard
  }

  private async getOnlinePoints(from: number, to: number): Promise<Map<string, ActivityPoint>> {
    interface DatabaseTimeframes {
      uuid: string
      discordId: string | null
      fromTimestamp: string
      toTimestamp: string
    }

    const timeframes = await this.postgresManager.query<DatabaseTimeframes>(
      `SELECT "OnlineMembers".uuid, links."discordId", "fromTimestamp", "toTimestamp"
       FROM "OnlineMembers"
       LEFT JOIN links ON ("OnlineMembers".uuid = links.uuid)
       WHERE (("fromTimestamp" BETWEEN $1 AND $2) OR ("toTimestamp" BETWEEN $1 AND $2))
       ORDER BY "fromTimestamp" ASC`,
      [Math.floor(from / 1000), Math.floor(to / 1000)]
    )

    const BaseScore = 15
    const ScoreCooldown = Duration.minutes(15).toSeconds()

    const leaderboard = new Map<string, ActivityPoint>()
    const reachedTimestamps = new Map<string, number>()

    for (const rawEntry of timeframes) {
      const entry = {
        uuid: rawEntry.uuid,
        discordId: rawEntry.discordId,
        fromTimestamp: Math.max(Number(rawEntry.fromTimestamp), Math.floor(from / 1000)),
        toTimestamp: Math.min(Number(rawEntry.toTimestamp), Math.floor(to / 1000))
      }

      let user = leaderboard.get(entry.uuid)
      if (user === undefined) {
        user = { uuid: entry.uuid, discordId: entry.discordId ?? undefined, points: 0 }
        leaderboard.set(entry.uuid, user)
      }
      user.discordId ??= entry.discordId ?? undefined

      let reachedTimestamp = reachedTimestamps.get(entry.uuid)
      if (entry.toTimestamp < (reachedTimestamp ?? 0)) continue

      if (reachedTimestamp === undefined) {
        reachedTimestamp = entry.fromTimestamp
      } else if (reachedTimestamp < entry.fromTimestamp) {
        if (reachedTimestamp + ScoreCooldown > entry.toTimestamp) {
          continue
        } else {
          reachedTimestamp += ScoreCooldown
        }
      } else {
        reachedTimestamp = Math.max(reachedTimestamp, entry.fromTimestamp)
      }

      for (; reachedTimestamp <= entry.toTimestamp; reachedTimestamp += ScoreCooldown) {
        user.points += BaseScore
      }

      reachedTimestamps.set(entry.uuid, reachedTimestamp)
    }

    return leaderboard
  }

  public async getPoints(from: number, to: number): Promise<Map<string, ActivityTotalPoints>> {
    assert.ok(from < to, '"from" timestamp must be earlier than the "to" timestamp')

    const leaderboard = new Map<string, ActivityTotalPoints>()
    const getUser = (entry: ActivityPoint) => {
      let user = leaderboard.get(entry.uuid)
      if (user === undefined) {
        user = {
          uuid: entry.uuid,
          discordId: entry.discordId ?? undefined,
          total: 0,
          chat: 0,
          online: 0,
          commands: 0
        }
        leaderboard.set(entry.uuid, user)
      }
      user.discordId ??= entry.discordId ?? undefined
      return user
    }

    for (const entry of (await this.getMessagesPoints(from, to)).values()) {
      const user = getUser(entry)
      const points = Math.floor(entry.points)

      user.total += points
      user.chat += points
    }
    for (const entry of (await this.getCommandsPoints(from, to)).values()) {
      const user = getUser(entry)
      const points = Math.floor(entry.points)

      user.total += points
      user.commands += points
    }
    for (const entry of (await this.getOnlinePoints(from, to)).values()) {
      const user = getUser(entry)
      const points = Math.floor(entry.points)

      user.total += points
      user.online += points
    }

    return leaderboard
  }

  public async getLegacyUsernames(oldestTimestamp: number): Promise<Set<string>> {
    const result = new Set<string>()

    const rows = await this.postgresManager.query<{ user: string }>(
      `SELECT "user" FROM "MinecraftMessages"
       WHERE timestamp > $1 AND length("user") < 30
       GROUP BY "user"`,
      [oldestTimestamp]
    )

    for (const row of rows) {
      result.add(row.user)
    }

    return result
  }

  public async migrateUsernameToUuid(
    oldestTimestamp: number,
    entries: { username: string; uuid: string }[]
  ): Promise<number> {
    return await this.postgresManager.withTransaction(async (client) => {
      let count = 0
      for (const entry of entries) {
        const result = await client.query(
          `UPDATE "MinecraftMessages" SET "user" = $1 WHERE "user" = $2 AND timestamp > $3`,
          [entry.uuid, entry.username, oldestTimestamp]
        )
        count += result.rowCount ?? 0
      }
      return count
    })
  }

  public async getBotUuids(): Promise<string[]> {
    const result = await this.postgresManager.query<{ uuid: string }>('SELECT uuid FROM "minecraftBots"')
    return result.map((r) => r.uuid)
  }

  public async addBotUuid(uuid: string): Promise<void> {
    await this.postgresManager.execute(
      `INSERT INTO "minecraftBots" (uuid)
       VALUES ($1)
       ON CONFLICT(uuid) DO UPDATE SET "updatedAt" = FLOOR(EXTRACT(EPOCH FROM NOW()))`,
      [uuid]
    )
  }

  public async clean(): Promise<number> {
    const currentTime = Math.floor(Date.now() / 1000)
    const oldestMessageTimestamp = currentTime - ScoresManager.DeleteMessagesOlderThan.toSeconds()
    const oldestMemberTimestamp = currentTime - ScoresManager.DeleteMembersOlderThan.toSeconds()

    return await this.postgresManager.withTransaction(async (client) => {
      let count = 0

      const r1 = await client.query('DELETE FROM "MinecraftMessages" WHERE timestamp < $1', [oldestMessageTimestamp])
      count += r1.rowCount ?? 0

      const r2 = await client.query('DELETE FROM "DiscordMessages" WHERE timestamp < $1', [oldestMessageTimestamp])
      count += r2.rowCount ?? 0

      const r3 = await client.query('DELETE FROM "MinecraftCommands" WHERE timestamp < $1', [oldestMessageTimestamp])
      count += r3.rowCount ?? 0

      const r4 = await client.query('DELETE FROM "DiscordCommands" WHERE timestamp < $1', [oldestMessageTimestamp])
      count += r4.rowCount ?? 0

      const r5 = await client.query('DELETE FROM "AllMembers" WHERE "toTimestamp" < $1', [oldestMemberTimestamp])
      count += r5.rowCount ?? 0

      const r6 = await client.query('DELETE FROM "OnlineMembers" WHERE "toTimestamp" < $1', [oldestMemberTimestamp])
      count += r6.rowCount ?? 0

      return count
    })
  }
}

interface Timeframe {
  uuid: string
  fromTimestamp: number
  toTimestamp: number
  leniencyMilliseconds: number
}

interface MessagesLeaderboard {
  user: string
  total: number
}

interface TotalMessagesLeaderboard {
  uuid: string
  count: number
  discordId: string | undefined
}

interface MemberLeaderboard {
  uuid: string
  totalTime: number
  discordId: string | undefined
}

interface DatabaseCountEntry {
  uuid: string
  count: number
  discordId: string | null
  timestamp: number
}

export interface ActivityPoint {
  uuid: string
  discordId: string | undefined
  points: number
}

export interface ActivityTotalPoints {
  uuid: string
  discordId: string | undefined

  total: number
  commands: number
  chat: number
  online: number
}
