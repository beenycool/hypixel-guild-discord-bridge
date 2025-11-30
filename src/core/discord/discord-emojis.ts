import type { PostgresManager } from '../../common/postgres-manager.js'

export class DiscordEmojis {
  constructor(private readonly postgresManager: PostgresManager) {}

  public async replaceAll(entries: EmojiConfig[]): Promise<void> {
    await this.postgresManager.withTransaction(async (client) => {
      const existingEntries = new Map<string, string>()
      const existingResult = await client.query<EmojiConfig>('SELECT name, hash FROM "discordEmojis"')
      for (const existingEntry of existingResult.rows) {
        existingEntries.set(existingEntry.name, existingEntry.hash)
      }

      const toRegisterEntries = new Map<string, string>()
      for (const entry of entries) {
        toRegisterEntries.set(entry.name, entry.hash)
      }

      for (const [toRegisterName, toRegisterHash] of toRegisterEntries) {
        const existingHash = existingEntries.get(toRegisterName)
        if (existingHash === undefined) {
          await client.query(
            'INSERT INTO "discordEmojis" (name, hash) VALUES ($1, $2)',
            [toRegisterName, toRegisterHash]
          )
          continue
        }

        existingEntries.delete(toRegisterName)
        if (toRegisterHash !== existingHash) {
          await client.query('DELETE FROM "discordEmojis" WHERE name = $1', [toRegisterName])
          await client.query(
            'INSERT INTO "discordEmojis" (name, hash) VALUES ($1, $2)',
            [toRegisterName, toRegisterHash]
          )
        }
      }

      for (const existingName of existingEntries.keys()) {
        await client.query('DELETE FROM "discordEmojis" WHERE name = $1', [existingName])
      }
    })
  }

  public async getAll(): Promise<EmojiConfig[]> {
    return await this.postgresManager.query<EmojiConfig>('SELECT name, hash FROM "discordEmojis"')
  }
}

export interface EmojiConfig {
  name: string
  hash: string
}
