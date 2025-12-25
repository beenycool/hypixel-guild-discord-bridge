import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { satisfies } from 'compare-versions'
import type { Configuration } from 'log4js'
import Logger4js from 'log4js'

import PackageJson from './package.json' with { type: 'json' }
import Application from './src/application.js'
import { Instance } from './src/common/instance'
import { loadApplicationConfig, parseApplicationConfig } from './src/configuration-parser.js'
import { loadI18 } from './src/i18next'
import { gracefullyExitProcess } from './src/utility/shared-utility'

const RequiredNodeVersion = PackageJson.engines.node
const ActualNodeVersion = process.versions.node
if (!satisfies(ActualNodeVersion, RequiredNodeVersion)) {
  // eslint-disable-next-line no-restricted-syntax
  console.error(
    `Application can not start due to Node.js being outdated.\n` +
      `This application depends on Node.js to work.\n` +
      `Please update Node.js before trying to launch the application again.\n` +
      'You can download Node.js latest version here: https://nodejs.org/en/download\n' +
      `Current version: ${ActualNodeVersion}, Required version: ${RequiredNodeVersion}`
  )
  process.exit(1)
}

const RootDirectory = import.meta.dirname
const ConfigsDirectory = path.resolve(RootDirectory, 'config')
fs.mkdirSync(ConfigsDirectory, { recursive: true })

const LoggerConfigName = 'log4js-config.json'
const LoggerPath = path.join(ConfigsDirectory, LoggerConfigName)
if (!fs.existsSync(LoggerPath)) {
  fs.copyFileSync(path.join(RootDirectory, 'src', LoggerConfigName), LoggerPath)
}
const LoggerConfig = JSON.parse(fs.readFileSync(LoggerPath, 'utf8')) as Configuration
const Logger = Logger4js.configure(LoggerConfig).getLogger('Main')
let app: Application | undefined

Logger.debug('Setting up process...')
process.on('uncaughtException', function (error) {
  Logger.fatal(error)
  process.exitCode = 1
})

let shutdownStarted = false
process.on('SIGINT', (signal) => {
  if (shutdownStarted) {
    Logger.info(`Process has caught ${signal} signal. Already shutting down. Wait!!`)
    return
  }

  shutdownStarted = true
  Logger.info(`Process has caught ${signal} signal.`)
  if (app !== undefined) {
    Logger.debug('Shutting down application')
    void app
      .shutdown()
      .then(() => gracefullyExitProcess(0))
      .catch(() => {
        process.exit(1)
      })
  }
})

process.title = PackageJson.name

Logger.debug('Loading up languages...')
const I18n = await loadI18()

if (process.argv.includes('test-run')) {
  Logger.warn('Argument passed to run in testing mode')
  Logger.warn('Test Loading finished.')
  Logger.warn('Returning from program with exit code 0')
  await gracefullyExitProcess(0)
}

const File = process.argv[2] ?? './config.yaml'
let config: ReturnType<typeof loadApplicationConfig>

// Priority order for loading configuration:
// 1. CONFIG_B64 - base64-encoded YAML/JSON (recommended for platforms that strip newlines)
// 2. CONFIG - raw YAML/JSON string
// 3. config file on disk (default: ./config.yaml)
if (process.env.CONFIG_B64) {
  Logger.info('Loading configuration from base64 environment variable "CONFIG_B64"')
  try {
    const decoded = Buffer.from(process.env.CONFIG_B64, 'base64').toString('utf8')
    config = parseApplicationConfig(decoded)
  } catch (err) {
    Logger.fatal('Failed to decode CONFIG_B64 environment variable')
    Logger.fatal(err)
    await gracefullyExitProcess(1)
    throw new Error('Process should have exited')
  }
} else if (process.env.CONFIG) {
  Logger.info('Loading configuration from environment variable "CONFIG"')
  try {
    config = parseApplicationConfig(process.env.CONFIG)
  } catch (err) {
    Logger.fatal('Failed to parse CONFIG environment variable')
    Logger.fatal(err)
    await gracefullyExitProcess(1)
    throw new Error('Process should have exited')
  }
} else {
  if (!fs.existsSync(File)) {
    Logger.fatal(`File ${File} does not exist.`)
    Logger.fatal(`You can rename config_example.yaml to config.yaml and use it as the configuration file.`)
    Logger.fatal(`If this is the first time running the application, please read README.md before proceeding.`)
    await gracefullyExitProcess(1)
    throw new Error('Process should have exited')
  }
  config = loadApplicationConfig(File)
}

try {
  app = new Application(config, RootDirectory, ConfigsDirectory, I18n.cloneInstance())

  const loggers = new Map<string, Logger4js.Logger>()
  app.onAny((name, event) => {
    const instanceName = (event as any).instanceName ?? 'unknown'
    let instanceLogger = loggers.get(instanceName)
    if (instanceLogger === undefined) {
      instanceLogger = Instance.createLogger(instanceName)
      loggers.set(instanceName, instanceLogger)
    }
    instanceLogger.log(`[${name}] ${JSON.stringify(event)}`)
  })

  await app.start()
  Logger.info('App is connected')
} catch (error: unknown) {
  Logger.fatal(error)
  Logger.fatal('stopping the process for the controller to restart this node...')
  process.exit(1)
}
