import type { PostgresManager } from '../../common/postgres-manager.js'

export class MinecraftAccounts {
  constructor(private readonly postgresManager: PostgresManager) {}

  public async set(uuid: string, options: GameToggleConfig): Promise<void> {
    await this.postgresManager.execute(
      `INSERT INTO "mojangProfileSettings" (id, "playerOnlineStatusEnabled", "guildAllEnabled", "guildChatEnabled", "guildNotificationsEnabled")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         "playerOnlineStatusEnabled" = EXCLUDED."playerOnlineStatusEnabled",
         "guildAllEnabled" = EXCLUDED."guildAllEnabled",
         "guildChatEnabled" = EXCLUDED."guildChatEnabled",
         "guildNotificationsEnabled" = EXCLUDED."guildNotificationsEnabled"`,
      [
        uuid,
        options.playerOnlineStatusEnabled ? 1 : 0,
        options.guildAllEnabled ? 1 : 0,
        options.guildChatEnabled ? 1 : 0,
        options.guildNotificationsEnabled ? 1 : 0
      ]
    )
  }

  public async get(uuid: string): Promise<GameToggleConfig> {
    const result = await this.postgresManager.queryOne<Record<keyof GameToggleConfig, number>>(
      'SELECT * FROM "mojangProfileSettings" WHERE id = $1',
      [uuid]
    )

    return {
      playerOnlineStatusEnabled: !!result?.playerOnlineStatusEnabled,
      guildAllEnabled: !!result?.guildAllEnabled,
      guildChatEnabled: !!result?.guildChatEnabled,
      guildNotificationsEnabled: !!result?.guildNotificationsEnabled
    }
  }
}

export interface GameToggleConfig {
  playerOnlineStatusEnabled: boolean

  guildAllEnabled: boolean
  guildChatEnabled: boolean
  guildNotificationsEnabled: boolean
}
