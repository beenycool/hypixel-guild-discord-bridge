import type { PoolClient } from 'pg'
import type { Logger } from 'log4js'

import type { PostgresManager } from '../common/postgres-manager.js'

const CurrentVersion = 3

export function initializeCoreDatabase(postgresManager: PostgresManager): void {
  postgresManager.setTargetVersion(CurrentVersion)

  postgresManager.registerMigrator(0, async (client, logger, postCleanupActions, newlyCreated) => {
    await migrateFrom0to1(client, logger, newlyCreated)
  })
  postgresManager.registerMigrator(1, async (client, logger, postCleanupActions, newlyCreated) => {
    await migrateFrom1to2(client, logger, newlyCreated)
  })
  postgresManager.registerMigrator(2, async (client, logger, postCleanupActions, newlyCreated) => {
    await migrateFrom2to3(client, logger, newlyCreated)
  })
}

async function setSchemaVersion(client: PoolClient, version: number): Promise<void> {
  await client.query(
    `UPDATE "schema_version" SET version = $1, updated_at = FLOOR(EXTRACT(EPOCH FROM NOW())) WHERE id = 1`,
    [version]
  )
}

async function migrateFrom0to1(client: PoolClient, logger: Logger, newlyCreated: boolean): Promise<void> {
  if (!newlyCreated) {
    logger.debug('Migrating database from version 0 to 1')
  }

  // reference: ./users/mojang.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "mojang" (
      uuid TEXT PRIMARY KEY NOT NULL,
      username TEXT UNIQUE NOT NULL,
      "loweredName" TEXT UNIQUE NOT NULL,
      "createdAt" BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))
    )
  `)

  // reference: ./users/verification.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "links" (
      uuid TEXT NOT NULL,
      "discordId" TEXT NOT NULL,
      "createdAt" BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW())),
      PRIMARY KEY(uuid, "discordId")
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS "linksDiscordId" ON "links" ("discordId")`)

  // reference: ./users/score-manager.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "DiscordMessages" (
      timestamp BIGINT NOT NULL,
      "user" TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(timestamp, "user")
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "MinecraftMessages" (
      timestamp BIGINT NOT NULL,
      "user" TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(timestamp, "user")
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "DiscordCommands" (
      timestamp BIGINT NOT NULL,
      "user" TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(timestamp, "user")
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "MinecraftCommands" (
      timestamp BIGINT NOT NULL,
      "user" TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(timestamp, "user")
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "AllMembers" (
      id SERIAL PRIMARY KEY,
      uuid TEXT NOT NULL,
      "fromDate" DATE GENERATED ALWAYS AS (to_timestamp("fromTimestamp")::date) STORED,
      "fromTimestamp" BIGINT NOT NULL,
      "toDate" DATE GENERATED ALWAYS AS (to_timestamp("toTimestamp")::date) STORED,
      "toTimestamp" BIGINT NOT NULL,
      CONSTRAINT "timeRange" CHECK("fromTimestamp" <= "toTimestamp")
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "OnlineMembers" (
      id SERIAL PRIMARY KEY,
      uuid TEXT NOT NULL,
      "fromDate" DATE GENERATED ALWAYS AS (to_timestamp("fromTimestamp")::date) STORED,
      "fromTimestamp" BIGINT NOT NULL,
      "toDate" DATE GENERATED ALWAYS AS (to_timestamp("toTimestamp")::date) STORED,
      "toTimestamp" BIGINT NOT NULL,
      CONSTRAINT "timeRange" CHECK("fromTimestamp" <= "toTimestamp")
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS "allMembersAppend" ON "AllMembers" (uuid, "fromDate", "toDate")`)
  await client.query(`CREATE INDEX IF NOT EXISTS "onlineMembersAppend" ON "OnlineMembers" (uuid, "fromDate", "toDate")`)

  await setSchemaVersion(client, 1)
}

async function migrateFrom1to2(client: PoolClient, logger: Logger, newlyCreated: boolean): Promise<void> {
  if (!newlyCreated) logger.debug('Migrating database from version 1 to 2')

  // reference: moderation/punishments.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "punishments" (
      id SERIAL PRIMARY KEY,
      "originInstance" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      type TEXT NOT NULL,
      purpose TEXT NOT NULL,
      reason TEXT NOT NULL,
      "createdAt" BIGINT NOT NULL,
      till BIGINT NOT NULL
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS "punishmentsIndex" ON "punishments" ("originInstance", "userId")`)

  // reference: moderation/commands-heat.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "heatsCommands" (
      id SERIAL PRIMARY KEY,
      "originInstance" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      type TEXT NOT NULL,
      "createdAt" BIGINT NOT NULL
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "heatsCommandsWarnings" (
      "originInstance" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      type TEXT NOT NULL,
      "warnedAt" BIGINT NOT NULL,
      PRIMARY KEY("originInstance", "userId", type)
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS "heatsCommandsIndex" ON "heatsCommands" ("originInstance", "userId")`)

  // reference: ./users/autocomplete.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "autocompleteUsernames" (
      "loweredContent" TEXT PRIMARY KEY NOT NULL,
      content TEXT NOT NULL,
      timestamp BIGINT NOT NULL
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "autocompleteRanks" (
      "loweredContent" TEXT PRIMARY KEY NOT NULL,
      content TEXT NOT NULL,
      timestamp BIGINT NOT NULL
    )
  `)

  await setSchemaVersion(client, 2)
}

async function migrateFrom2to3(client: PoolClient, logger: Logger, newlyCreated: boolean): Promise<void> {
  if (!newlyCreated) logger.debug('Migrating database from version 2 to 3')

  // reference: configurations.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "configurations" (
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      "lastUpdatedAt" BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW())),
      PRIMARY KEY(category, name)
    )
  `)

  // reference: minecraft/sessions-manager.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "proxies" (
      id SERIAL PRIMARY KEY,
      protocol TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      "user" TEXT DEFAULT NULL,
      password TEXT DEFAULT NULL,
      "createdAt" BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "mojangInstances" (
      name TEXT PRIMARY KEY NOT NULL,
      "proxyId" INTEGER REFERENCES "proxies"(id) NULL
    )
  `)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "mojangSessions" (
      name TEXT NOT NULL REFERENCES "mojangInstances"(name),
      "cacheName" TEXT NOT NULL,
      value TEXT NOT NULL,
      "createdAt" BIGINT NOT NULL,
      PRIMARY KEY(name, "cacheName")
    )
  `)

  // reference: minecraft/account-settings.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "mojangProfileSettings" (
      id TEXT PRIMARY KEY NOT NULL,
      "playerOnlineStatusEnabled" INTEGER NOT NULL DEFAULT 0,
      "guildAllEnabled" INTEGER NOT NULL DEFAULT 0,
      "guildChatEnabled" INTEGER NOT NULL DEFAULT 0,
      "guildNotificationsEnabled" INTEGER NOT NULL DEFAULT 0
    )
  `)

  // reference: discord/discord-leaderboards.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "discordLeaderboards" (
      "messageId" TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      "guildId" TEXT,
      "updatedAt" BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW())),
      "createdAt" BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))
    )
  `)

  // reference: discord/discord-temporarily-interactions.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "discordTempInteractions" (
      "messageId" TEXT PRIMARY KEY NOT NULL,
      "channelId" TEXT NOT NULL,
      "createdAt" BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))
    )
  `)

  // reference: discord/discord-emojis.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "discordEmojis" (
      name TEXT PRIMARY KEY NOT NULL,
      hash TEXT NOT NULL,
      "createdAt" BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))
    )
  `)

  // reference: users/scores-manager.ts
  await client.query(`
    CREATE TABLE IF NOT EXISTS "minecraftBots" (
      uuid TEXT PRIMARY KEY NOT NULL,
      "updatedAt" BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW())),
      "createdAt" BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))
    )
  `)

  await setSchemaVersion(client, 3)
}
