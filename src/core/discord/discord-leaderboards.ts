import type { PostgresManager } from '../../common/postgres-manager.js'

export class DiscordLeaderboards {
  constructor(private readonly postgresManager: PostgresManager) {}

  public async getAll(): Promise<LeaderboardEntry[]> {
    const entries = await this.postgresManager.query<LeaderboardEntryRow>(
      'SELECT * FROM "discordLeaderboards"'
    )

    return entries.map((entry) => ({
      messageId: entry.messageId,
      type: entry.type as LeaderboardEntry['type'],
      channelId: entry.channelId,
      guildId: entry.guildId ?? undefined,
      updatedAt: Number(entry.updatedAt) * 1000,
      createdAt: Number(entry.createdAt) * 1000
    }))
  }

  public async addOrSet(entry: LeaderboardEntry): Promise<void> {
    await this.postgresManager.execute(
      `INSERT INTO "discordLeaderboards" ("messageId", type, "channelId", "guildId")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("messageId") DO UPDATE SET
         type = EXCLUDED.type,
         "channelId" = EXCLUDED."channelId",
         "guildId" = EXCLUDED."guildId"`,
      [entry.messageId, entry.type, entry.channelId, entry.guildId ?? null]
    )
  }

  public async updateTime(entries: { messageId: string; updatedAt: number }[]): Promise<void> {
    await this.postgresManager.withTransaction(async (client) => {
      for (const entry of entries) {
        await client.query(
          'UPDATE "discordLeaderboards" SET "updatedAt" = $1 WHERE "messageId" = $2',
          [Math.floor(entry.updatedAt / 1000), entry.messageId]
        )
      }
    })
  }

  public async remove(messagesIds: string[]): Promise<number> {
    return await this.postgresManager.withTransaction(async (client) => {
      let count = 0
      for (const messageId of messagesIds) {
        const result = await client.query(
          'DELETE FROM "discordLeaderboards" WHERE "messageId" = $1',
          [messageId]
        )
        count += result.rowCount ?? 0
      }
      return count
    })
  }
}

interface LeaderboardEntryRow {
  messageId: string
  type: string
  channelId: string
  guildId: string | null
  updatedAt: string | number
  createdAt: string | number
}

export interface LeaderboardEntry {
  messageId: string
  type: 'messages30Days' | 'online30Days' | 'points30Days'

  channelId: string
  guildId: string | undefined

  updatedAt: number
  createdAt: number
}
