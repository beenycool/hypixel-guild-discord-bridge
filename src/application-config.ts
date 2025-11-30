export const ApplicationConfigVersion = 3

export interface GeneralConfig {
  hypixelApiKey: string
  shareMetrics: boolean
  urchinApiKey?: string
}

export interface DatabaseConfig {
  /**
   * PostgreSQL connection string.
   * For Nest internal: postgres://username@localhost/username_database?sslmode=disable&host=/var/run/postgresql
   * For external: postgres://username:password@hackclub.app/username_database
   */
  connectionString: string
}

export interface StaticDiscordConfig {
  key: string
  adminIds: string[]
}

export interface PrometheusConfig {
  enabled: boolean
  port: number
  prefix: string
}

export interface ApplicationConfig {
  version: 3 // typeof ApplicationConfigVersion
  general: GeneralConfig
  database: DatabaseConfig
  discord: StaticDiscordConfig
  prometheus: PrometheusConfig
}
