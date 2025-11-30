import type { PostgresManager } from '../../common/postgres-manager.js'

import type { DiscordConfigurations } from './discord-configurations.js'

export class DiscordTemporarilyInteractions {
  constructor(
    private readonly postgresManager: PostgresManager,
    private readonly discordConfigurations: DiscordConfigurations
  ) {}

  public async add(entries: DiscordMessage[]): Promise<void> {
    await this.postgresManager.withTransaction(async (client) => {
      for (const entry of entries) {
        await client.query(
          `INSERT INTO "discordTempInteractions" ("messageId", "channelId", "createdAt")
           VALUES ($1, $2, $3)
           ON CONFLICT ("messageId") DO UPDATE SET
             "channelId" = EXCLUDED."channelId",
             "createdAt" = EXCLUDED."createdAt"`,
          [entry.messageId, entry.channelId, Math.floor(entry.createdAt / 1000)]
        )
      }
    })
  }

  public async findToDelete(): Promise<DiscordMessage[]> {
    const currentTime = Date.now()
    const maxInteractions = this.discordConfigurations.getMaxTemporarilyInteractions()
    const duration = this.discordConfigurations.getDurationTemporarilyInteractions()

    const allInteractions = await this.postgresManager.query<DiscordMessageRow>(
      'SELECT * FROM "discordTempInteractions"'
    )

    const toDelete: DiscordMessage[] = []

    // Convert rows to DiscordMessage and sort by createdAt descending
    const interactions: DiscordMessage[] = allInteractions.map((row) => ({
      messageId: row.messageId,
      channelId: row.channelId,
      createdAt: Number(row.createdAt)
    }))

    interactions.sort((a, b) => b.createdAt - a.createdAt)

    const interactionsCount = new Map<string, number>()
    for (const interaction of interactions) {
      if (interaction.createdAt * 1000 + duration.toMilliseconds() < currentTime) {
        toDelete.push(interaction)
        continue
      }

      const currentInteractionsCount = interactionsCount.get(interaction.channelId) ?? 0
      if (currentInteractionsCount >= maxInteractions) {
        toDelete.push(interaction)
        continue
      }

      interactionsCount.set(interaction.channelId, currentInteractionsCount + 1)
    }

    return toDelete
  }

  public async remove(messagesIds: DiscordMessage['messageId'][]): Promise<number> {
    return await this.postgresManager.withTransaction(async (client) => {
      let count = 0
      for (const messageId of messagesIds) {
        const result = await client.query(
          'DELETE FROM "discordTempInteractions" WHERE "messageId" = $1',
          [messageId]
        )
        count += result.rowCount ?? 0
      }
      return count
    })
  }
}

interface DiscordMessageRow {
  channelId: string
  messageId: string
  createdAt: string | number
}

export interface DiscordMessage {
  channelId: string
  messageId: string
  createdAt: number
}
