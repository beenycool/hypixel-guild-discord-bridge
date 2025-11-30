import type { PoolClient } from 'pg'
import type { Logger } from 'log4js'

import type { PostgresManager } from '../../common/postgres-manager.js'
import type { User, UserIdentifier } from '../../common/user.js'
import Duration from '../../utility/duration.js'

import type { ModerationConfigurations } from './moderation-configurations.js'

export class CommandsHeat {
  private static readonly ActionExpiresAfter = Duration.days(1)
  private static readonly WarnPercentage = 0.8
  private static readonly WarnEvery = Duration.minutes(30)

  private readonly moderationConfig

  constructor(
    private readonly postgresManager: PostgresManager,
    config: ModerationConfigurations,
    logger: Logger
  ) {
    this.moderationConfig = config

    postgresManager.registerCleaner(async () => {
      const oldestTimestamp = Date.now() - CommandsHeat.ActionExpiresAfter.toMilliseconds()
      const result = await postgresManager.execute(
        'DELETE FROM "heatsCommands" WHERE "createdAt" < $1',
        [Math.floor(oldestTimestamp / 1000)]
      )
      if (result > 0) logger.debug(`Deleted ${result} entry of expired heats-commands`)
    })
  }

  public async add(user: User, type: HeatType): Promise<HeatResult> {
    const currentTime = Date.now()

    const userIdentifier = user.getUserIdentifier()
    const allIdentifiers = user.allIdentifiers()
    const action: HeatAction = { identifier: user.getUserIdentifier(), timestamp: currentTime, type: type }

    return await this.postgresManager.withTransaction(async (client) => {
      if (user.immune()) {
        await this.addEntries(client, [action])
        return HeatResult.Allowed
      }

      const heatActions = await this.getUserHeats(client, currentTime, allIdentifiers, type)
      const typeInfo = this.resolveType(type)

      await this.addEntries(client, [action])

      if (heatActions >= typeInfo.maxLimit) return HeatResult.Denied

      // 1+ added to help with low warnLimit
      if (heatActions + 1 >= typeInfo.warnLimit && !(await this.warned(client, currentTime, allIdentifiers, type))) {
        await this.setLastWarning(client, currentTime, userIdentifier, type)
        return HeatResult.Warn
      }

      return HeatResult.Allowed
    })
  }

  public async tryAdd(user: User, type: HeatType): Promise<HeatResult> {
    const currentTime = Date.now()

    const userIdentifier = user.getUserIdentifier()
    const allIdentifiers = user.allIdentifiers()
    const action: HeatAction = { identifier: user.getUserIdentifier(), timestamp: currentTime, type: type }

    return await this.postgresManager.withTransaction(async (client) => {
      if (user.immune()) {
        await this.addEntries(client, [action])
        return HeatResult.Allowed
      }

      const heatActions = await this.getUserHeats(client, currentTime, allIdentifiers, type)
      const typeInfo = this.resolveType(type)

      if (heatActions >= typeInfo.maxLimit) return HeatResult.Denied

      await this.addEntries(client, [action])

      // 1+ added to help with low warnLimit
      if (heatActions + 1 >= typeInfo.warnLimit && !(await this.warned(client, currentTime, allIdentifiers, type))) {
        await this.setLastWarning(client, currentTime, userIdentifier, type)
        return HeatResult.Warn
      }

      return HeatResult.Allowed
    })
  }

  private async addEntries(client: PoolClient, heatActions: HeatAction[]): Promise<void> {
    for (const heatAction of heatActions) {
      await client.query(
        'INSERT INTO "heatsCommands" ("originInstance", "userId", type, "createdAt") VALUES ($1, $2, $3, $4)',
        [
          heatAction.identifier.originInstance,
          heatAction.identifier.userId,
          heatAction.type,
          Math.floor(heatAction.timestamp / 1000)
        ]
      )
    }
  }

  private async getUserHeats(
    client: PoolClient,
    currentTime: number,
    identifiers: UserIdentifier[],
    type: HeatType
  ): Promise<number> {
    let query = 'SELECT COUNT(*) FROM "heatsCommands" WHERE '
    const parameters: unknown[] = []
    let paramIndex = 1

    if (identifiers.length > 0) {
      query += '('
      for (let index = 0; index < identifiers.length; index++) {
        const identifier = identifiers[index]

        parameters.push(identifier.originInstance)
        parameters.push(identifier.userId)

        query += `("originInstance" = $${paramIndex++} AND "userId" = $${paramIndex++})`
        if (index !== identifiers.length - 1) query += ' OR '
      }
      query += ') AND '
    }

    query += `type = $${paramIndex++} AND "createdAt" > $${paramIndex++}`
    parameters.push(type)
    parameters.push(Math.floor((currentTime - CommandsHeat.ActionExpiresAfter.toMilliseconds()) / 1000))

    const result = await client.query(query, parameters)
    return Number(result.rows[0].count)
  }

  private async warned(
    client: PoolClient,
    currentTime: number,
    identifiers: UserIdentifier[],
    type: HeatType
  ): Promise<boolean> {
    let query = 'SELECT COALESCE(MAX("warnedAt"), 0) as max_warned FROM "heatsCommandsWarnings" WHERE '
    const parameters: unknown[] = []
    let paramIndex = 1

    if (identifiers.length > 0) {
      query += '('
      for (let index = 0; index < identifiers.length; index++) {
        const identifier = identifiers[index]

        parameters.push(identifier.originInstance)
        parameters.push(identifier.userId)

        query += `("originInstance" = $${paramIndex++} AND "userId" = $${paramIndex++})`
        if (index !== identifiers.length - 1) query += ' OR '
      }
      query += ') AND '
    }

    query += `type = $${paramIndex++}`
    parameters.push(type)

    const result = await client.query(query, parameters)
    const lastWarning = Number(result.rows[0].max_warned)

    return lastWarning * 1000 + CommandsHeat.WarnEvery.toMilliseconds() > currentTime
  }

  private async setLastWarning(
    client: PoolClient,
    timestamp: number,
    identifier: UserIdentifier,
    type: HeatType
  ): Promise<void> {
    await client.query(
      `INSERT INTO "heatsCommandsWarnings" ("originInstance", "userId", type, "warnedAt")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("originInstance", "userId", type) DO UPDATE SET "warnedAt" = EXCLUDED."warnedAt"`,
      [identifier.originInstance, identifier.userId, type, Math.floor(timestamp / 1000)]
    )
  }

  private resolveType(type: HeatType): { expire: Duration; maxLimit: number; warnLimit: number; warnEvery: Duration } {
    const common = { expire: CommandsHeat.ActionExpiresAfter, warnEvery: CommandsHeat.WarnEvery }
    switch (type) {
      case HeatType.Mute: {
        return { ...common, ...CommandsHeat.resolveLimits(this.moderationConfig.getMutesPerDay()) }
      }
      case HeatType.Kick: {
        return { ...common, ...CommandsHeat.resolveLimits(this.moderationConfig.getKicksPerDay()) }
      }
    }

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error(`Type ${type} does not exists??`)
  }

  private static resolveLimits(maxLimit: number): { maxLimit: number; warnLimit: number } {
    const limits = { maxLimit: maxLimit, warnLimit: maxLimit }
    if (maxLimit <= 0) {
      limits.maxLimit = limits.warnLimit = Number.MAX_SAFE_INTEGER
      return limits
    } else if (maxLimit === 1) {
      return limits
    } else {
      limits.warnLimit = maxLimit * this.WarnPercentage
      return limits
    }
  }
}

interface HeatAction {
  identifier: UserIdentifier
  type: HeatType
  timestamp: number
}

export enum HeatType {
  Kick = 'kick',
  Mute = 'mute'
}

export enum HeatResult {
  Allowed = 'allowed',
  Warn = 'warn',
  Denied = 'denied'
}
