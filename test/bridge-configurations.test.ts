import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { SqliteManager } from '../src/common/sqlite-manager'
import { ConfigurationsManager } from '../src/core/configurations'
import { BridgeConfigurations } from '../src/core/discord/bridge-configurations'
import { initializeCoreDatabase } from '../src/core/initialize-database'

// Minimal fake logger
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
} as unknown as Parameters<typeof SqliteManager>[1]

// Minimal fake application with expected hooks used by SqliteManager and migrations
const fakeApp: any = {
  applicationIntegrity: { addConfigPath: () => {} },
  addShutdownListener: () => {}
}

const databasePath = path.join(os.tmpdir(), `hypixel-test-db-${Date.now()}.db`)

try {
  const sqliteManager = new SqliteManager(fakeApp, logger, databasePath)

  // Initialize schema
  initializeCoreDatabase(fakeApp, sqliteManager, 'test')

  const configs = new ConfigurationsManager(sqliteManager)
  const bridgeCfg = new BridgeConfigurations(configs)

  const bridgeId = 'bridge-test'

  // default should be true
  assert.strictEqual(bridgeCfg.getSkyblockEventsEnabled(bridgeId), true)

  bridgeCfg.setSkyblockEventsEnabled(bridgeId, false)
  assert.strictEqual(bridgeCfg.getSkyblockEventsEnabled(bridgeId), false)

  // Notifiers default -> undefined
  assert.strictEqual(bridgeCfg.getSkyblockEventNotifiers(bridgeId), undefined)

  bridgeCfg.setSkyblockEventNotifier(bridgeId, 'BANK_INTEREST', false)
  const notifiers = bridgeCfg.getSkyblockEventNotifiers(bridgeId)
  assert.ok(notifiers)
  assert.strictEqual(notifiers.BANK_INTEREST, false)

  bridgeCfg.setSkyblockEventNotifier(bridgeId, 'BANK_INTEREST', true)
  const notifiers2 = bridgeCfg.getSkyblockEventNotifiers(bridgeId)
  assert.strictEqual(notifiers2!.BANK_INTEREST, true)

  bridgeCfg.deleteSkyblockNotifiers(bridgeId)
  assert.strictEqual(bridgeCfg.getSkyblockEventNotifiers(bridgeId), undefined)

  console.log('PASS: BridgeConfigurations DB getters/setters')
} finally {
  try {
    fs.unlinkSync(databasePath)
  } catch {
    // ignore
  }
}
