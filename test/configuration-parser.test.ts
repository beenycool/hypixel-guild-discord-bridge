import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { loadApplicationConfig, parseApplicationConfig } from '../src/configuration-parser.js'

function writeTemporaryYaml(content: string): string {
  const temporary = path.join(os.tmpdir(), `hypixel-config-test-${Date.now()}.yaml`)
  fs.writeFileSync(temporary, content, 'utf8')
  return temporary
}

function buildMinimalConfig(adminIds: string[] | number[]) {
  return `version: 2
general:
  hypixelApiKey: "test-key"
  shareMetrics: false
discord:
  key: "discord-key"
  adminIds: ${JSON.stringify(adminIds)}
prometheus:
  enabled: false
  port: 9090
  prefix: "hypixel_bridge_"
`
}

// Test numeric admin id (unquoted) will be coerced to string
const numericYaml = buildMinimalConfig([1_174_785_696_528_072_738 as unknown as number])
const numericPath = writeTemporaryYaml(numericYaml)
const numericConfig = loadApplicationConfig(numericPath)
if (!Array.isArray(numericConfig.discord.adminIds)) throw new Error('adminIds not an array')
if (typeof numericConfig.discord.adminIds[0] !== 'string') throw new Error('numeric adminId was not coerced to string')
console.log('PASS: numeric adminId coerced to string')

// Test string admin id remains string
const stringYaml = buildMinimalConfig(['1174785696528072738'])
const stringPath = writeTemporaryYaml(stringYaml)
const stringConfig = loadApplicationConfig(stringPath)
if (typeof stringConfig.discord.adminIds[0] !== 'string') throw new Error('string adminId is not string')
console.log('PASS: string adminId remains string')

// Test parseApplicationConfig directly
const directYaml = buildMinimalConfig(['12345'])
const directConfig = parseApplicationConfig(directYaml)
if (directConfig.discord.adminIds[0] !== '12345') throw new Error('parseApplicationConfig failed')
console.log('PASS: parseApplicationConfig works')

// Test environment variable substitution
process.env.TEST_KEY = 'env-test-key'
const envYaml = buildMinimalConfig(['123']).replace('test-key', '${TEST_KEY}')
const envConfig = parseApplicationConfig(envYaml)
if (envConfig.general.hypixelApiKey !== 'env-test-key') throw new Error('env var substitution failed')
console.log('PASS: environment variable substitution works')

console.log('All configuration-parser tests passed')
