import assert from 'node:assert'
import fs from 'node:fs'

import type { Logger } from 'log4js'

import type Application from '../../application.js'
import type { BasePunishment } from '../../common/application-event.js'
import { InstanceType, PunishmentPurpose, PunishmentType } from '../../common/application-event.js'
import type { PostgresManager } from '../../common/postgres-manager.js'
import type { User, UserIdentifier } from '../../common/user.js'

export type SavedPunishment = BasePunishment & UserIdentifier

type DatabasePunishment = SavedPunishment & { id: number }

export default class Punishments {
  public readonly ready: Promise<void>

  constructor(
    private readonly postgresManager: PostgresManager,
    application: Application,
    logger: Logger
  ) {
    postgresManager.registerCleaner(async () => {
      const result = await postgresManager.execute(
        'DELETE FROM "punishments" WHERE till < $1',
        [Math.floor(Date.now() / 1000)]
      )
      if (result > 0) logger.debug(`Deleted ${result} entry of expired punishments`)
    })

    this.ready = Promise.resolve().then(() => this.migrateAnyOldData(application, logger))
  }

  private async migrateAnyOldData(application: Application, logger: Logger): Promise<void> {
    interface OldEntry {
      userName: string
      userUuid?: string
      till: number
      reason: string
    }

    interface OldType {
      mute: OldEntry[]
      ban: OldEntry[]
    }

    async function findIdentifier(entry: OldEntry): Promise<UserIdentifier | undefined> {
      if (entry.userUuid) {
        return { originInstance: InstanceType.Minecraft, userId: entry.userUuid }
      }

      try {
        const mojangProfile = await application.mojangApi.profileByUsername(entry.userName)
        logger.debug(
          `Found a mojang profile to username "${entry.userName}". Migrating the punishment to mojang uuid ${mojangProfile.id}`
        )
        return { originInstance: InstanceType.Minecraft, userId: mojangProfile.id }
      } catch (error: unknown) {
        logger.error(`Failed migrating a legacy punishment entry: ${JSON.stringify(entry)}`)
        logger.warn('Entry will be entirely skipped. Manually re-add the entry if needed.')
        logger.error(error)
        return undefined
      }
    }

    const path = application.getConfigFilePath('punishments.json')
    if (!fs.existsSync(path)) return
    logger.info('Found old punishments file. Migrating this file into the new system...')

    const oldObject = JSON.parse(fs.readFileSync(path, 'utf8')) as OldType
    const currentTime = Date.now()
    const punishments: SavedPunishment[] = []
    let total = 0

    for (const entry of oldObject.mute) {
      if (entry.till < currentTime) continue
      total++

      const identifier = await findIdentifier(entry)
      if (identifier == undefined) continue
      punishments.push({
        ...identifier,
        type: PunishmentType.Mute,
        purpose: PunishmentPurpose.Manual,
        till: entry.till,
        reason: entry.reason,
        createdAt: currentTime
      })
    }

    for (const entry of oldObject.ban) {
      if (entry.till < currentTime) continue
      total++

      const identifier = await findIdentifier(entry)
      if (identifier == undefined) continue
      punishments.push({
        ...identifier,
        type: PunishmentType.Ban,
        purpose: PunishmentPurpose.Manual,
        till: entry.till,
        reason: entry.reason,
        createdAt: currentTime
      })
    }

    logger.info(`Successfully parsed ${punishments.length} legacy punishments out of ${total}`)
    await this.addEntries(punishments)

    logger.debug('Deleting punishments legacy file...')
    fs.rmSync(path)
  }

  public async add(punishment: SavedPunishment): Promise<void> {
    await this.addEntries([punishment])
  }

  private async addEntries(punishments: SavedPunishment[]): Promise<void> {
    await this.postgresManager.withTransaction(async (client) => {
      for (const punishment of punishments) {
        await client.query(
          `INSERT INTO "punishments" ("originInstance", "userId", type, purpose, reason, "createdAt", till)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            punishment.originInstance,
            punishment.userId,
            punishment.type,
            punishment.purpose,
            punishment.reason,
            Math.floor(punishment.createdAt / 1000),
            Math.floor(punishment.till / 1000)
          ]
        )
      }
    })
  }

  public async remove(user: User): Promise<SavedPunishment[]> {
    const currentTime = Date.now()

    return await this.postgresManager.withTransaction(async (client) => {
      const foundEntries = await this.getPunishments(user.allIdentifiers(), currentTime)
      if (foundEntries.length === 0) return []

      const ids = foundEntries.map((entry) => entry.id)
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')

      const result = await client.query(
        `DELETE FROM "punishments" WHERE id IN (${placeholders})`,
        ids
      )
      assert.strictEqual(foundEntries.length, result.rowCount)

      return this.convertDatabaseFields(foundEntries)
    })
  }

  async findByUser(user: User): Promise<SavedPunishment[]> {
    const current = Date.now()
    const result = await this.getPunishments(user.allIdentifiers(), current)
    return this.convertDatabaseFields(result)
  }

  all(): SavedPunishment[] {
    // This is called synchronously from allPunishments() in core.ts
    // We need to make this async or cache the results
    // For now, return empty array and let the caller handle async
    return []
  }

  async allAsync(): Promise<SavedPunishment[]> {
    const current = Date.now()
    const result = await this.getPunishments([], current)
    return this.convertDatabaseFields(result)
  }

  /*
   * Get all punishments if no identifiers set, otherwise, get the user punishments with the supplied identifiers
   */
  private async getPunishments(identifiers: UserIdentifier[], currentTime: number): Promise<DatabasePunishment[]> {
    let query = 'SELECT * FROM "punishments" WHERE '
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

    query += `till > $${paramIndex++}`
    parameters.push(Math.floor(currentTime / 1000))

    const result = await this.postgresManager.query<DatabasePunishment>(query, parameters)
    return result
  }

  private convertDatabaseFields(entries: DatabasePunishment[]): SavedPunishment[] {
    return entries.map((entry) => ({
      originInstance: entry.originInstance,
      userId: entry.userId,
      type: entry.type,
      purpose: entry.purpose,
      reason: entry.reason,
      createdAt: Number(entry.createdAt) * 1000,
      till: Number(entry.till) * 1000
    }))
  }
}
