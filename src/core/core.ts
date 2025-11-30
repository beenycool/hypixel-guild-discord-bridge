/*
 * Credit WildWolfsblut <https://github.com/WildWolfsblut>
 * for helping with ./src/core design and structure
 */
import assert from 'node:assert'

import type Application from '../application.js'
import { InstanceType } from '../common/application-event.js'
import { Instance, InternalInstancePrefix } from '../common/instance.js'
import { PostgresManager } from '../common/postgres-manager.js'
import type {
  DiscordProfile,
  DiscordUser,
  InitializeOptions,
  ManagerContext,
  MinecraftUser,
  MojangProfile,
  UserIdentifier
} from '../common/user.js'
import { User } from '../common/user.js'

import { ApplicationConfigurations } from './application-configurations.js'
import { CommandsConfigurations } from './commands/commands-configurations.js'
import { ConfigurationsManager } from './configurations.js'
import { DiscordConfigurations } from './discord/discord-configurations.js'
import { DiscordEmojis } from './discord/discord-emojis.js'
import { DiscordLeaderboards } from './discord/discord-leaderboards.js'
import { DiscordTemporarilyInteractions } from './discord/discord-temporarily-interactions.js'
import { initializeCoreDatabase } from './initialize-database.js'
import { LanguageConfigurations } from './language-configurations.js'
import { MinecraftAccounts } from './minecraft/minecraft-accounts.js'
import { MinecraftConfigurations } from './minecraft/minecraft-configurations.js'
import { SessionsManager } from './minecraft/sessions-manager.js'
import { CommandsHeat } from './moderation/commands-heat.js'
import { ModerationConfigurations } from './moderation/moderation-configurations.js'
import { Profanity } from './moderation/profanity.js'
import type { SavedPunishment } from './moderation/punishments.js'
import Punishments from './moderation/punishments.js'
import PunishmentsEnforcer from './moderation/punishments-enforcer.js'
import Autocomplete from './users/autocomplete.js'
import { GuildManager } from './users/guild-manager.js'
import { MojangApi } from './users/mojang.js'
import ScoresManager from './users/scores-manager.js'
import { Verification } from './users/verification.js'

export class Core extends Instance<InstanceType.Core> {
  // moderation
  private commandsHeat!: CommandsHeat
  private profanity!: Profanity
  private punishments!: Punishments
  private enforcer!: PunishmentsEnforcer

  // users
  private autoComplete!: Autocomplete
  public guildManager!: GuildManager
  public mojangApi!: MojangApi
  public scoresManager!: ScoresManager
  public verification!: Verification

  // discord
  public discordConfigurations!: DiscordConfigurations
  public discordLeaderboards!: DiscordLeaderboards
  public discordTemporarilyInteractions!: DiscordTemporarilyInteractions
  public discordEmojis!: DiscordEmojis

  // minecraft
  public minecraftConfigurations!: MinecraftConfigurations
  public minecraftSessions!: SessionsManager
  public moderationConfiguration!: ModerationConfigurations
  public minecraftAccounts!: MinecraftAccounts

  public applicationConfigurations!: ApplicationConfigurations
  public languageConfigurations!: LanguageConfigurations
  public commandsConfigurations!: CommandsConfigurations

  // database
  private postgresManager!: PostgresManager
  private configurationsManager!: ConfigurationsManager

  private initPromise: Promise<void>

  public constructor(application: Application, connectionString: string) {
    super(application, InternalInstancePrefix + 'core', InstanceType.Core)

    // Store the initialization promise for awaitReady
    this.initPromise = this.initialize(connectionString)
  }

  private async initialize(connectionString: string): Promise<void> {
    // Initialize PostgreSQL connection
    this.postgresManager = new PostgresManager(this.application, this.logger, connectionString)
    await this.postgresManager.initialize()

    // Set up database migrations
    initializeCoreDatabase(this.postgresManager)
    await this.postgresManager.migrate()

    // Initialize configurations manager and load all configs into cache
    this.configurationsManager = new ConfigurationsManager(this.postgresManager)
    await this.configurationsManager.init()

    // Now initialize all the components that depend on configurations
    this.discordConfigurations = new DiscordConfigurations(this.configurationsManager)
    this.discordLeaderboards = new DiscordLeaderboards(this.postgresManager)
    this.discordTemporarilyInteractions = new DiscordTemporarilyInteractions(
      this.postgresManager,
      this.discordConfigurations
    )
    this.discordEmojis = new DiscordEmojis(this.postgresManager)

    this.applicationConfigurations = new ApplicationConfigurations(this.configurationsManager)
    this.languageConfigurations = new LanguageConfigurations(this.configurationsManager)
    this.commandsConfigurations = new CommandsConfigurations(this.configurationsManager)

    this.minecraftConfigurations = new MinecraftConfigurations(this.configurationsManager)
    this.minecraftSessions = new SessionsManager(this.postgresManager, this.logger)
    this.minecraftAccounts = new MinecraftAccounts(this.postgresManager)

    this.moderationConfiguration = new ModerationConfigurations(this.configurationsManager)
    this.mojangApi = new MojangApi(this.postgresManager)

    this.profanity = new Profanity(this.moderationConfiguration)
    this.punishments = new Punishments(this.postgresManager, this.application, this.logger)
    this.commandsHeat = new CommandsHeat(this.postgresManager, this.moderationConfiguration, this.logger)
    this.enforcer = new PunishmentsEnforcer(this.application, this, this.eventHelper, this.logger, this.errorHandler)

    this.guildManager = new GuildManager(this.application, this, this.eventHelper, this.logger, this.errorHandler)
    this.autoComplete = new Autocomplete(
      this.application,
      this,
      this.eventHelper,
      this.logger,
      this.errorHandler,
      this.postgresManager
    )

    this.verification = new Verification(this.postgresManager)
    this.scoresManager = new ScoresManager(
      this.application,
      this,
      this.eventHelper,
      this.logger,
      this.errorHandler,
      this.postgresManager
    )

    // Wait for punishments to be ready
    await this.punishments.ready
  }

  public completeUsername(query: string, limit: number): string[] {
    return this.autoComplete.username(query, limit)
  }

  public completeRank(query: string, limit: number): string[] {
    return this.autoComplete.rank(query, limit)
  }

  public filterProfanity(message: string): { filteredMessage: string; changed: boolean } {
    return this.profanity.filterProfanity(message)
  }

  public async allPunishments(): Promise<SavedPunishment[]> {
    return await this.punishments.all()
  }

  public async awaitReady(): Promise<void> {
    await this.initPromise
  }

  /**
   * @internal Only used by the config managers
   */
  public reloadProfanity(): void {
    this.profanity.reloadProfanity()
  }

  /**
   * Initialize a user based on a given profile and load all metadata in advance
   * @param profile Profile to base the user on
   * @param context additional information that might help with constructing user metadata
   * @returns a full initialized object that contains user data at the moment of execution
   */
  async initializeDiscordUser(
    profile: DiscordProfile,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: InitializeOptions
  ): Promise<DiscordUser> {
    const identifier: UserIdentifier = { userId: profile.id, originInstance: InstanceType.Discord }

    let mojangProfile: MojangProfile | undefined
    const userLink = await this.application.core.verification.findByDiscord(profile.id)
    if (userLink !== undefined) {
      mojangProfile = await this.application.mojangApi.profileByUuid(userLink.uuid)
    }

    const user = new User(this.application, this.userContext(), identifier, mojangProfile, profile, userLink)
    assert.ok(user.isDiscordUser())
    return user
  }

  /**
   * Initialize a user based on a given profile and load all metadata in advance
   * @param mojangProfile Profile to base the user on
   * @param context additional information that might help with constructing user metadata
   * @returns a full initialized object that contains user data at the moment of execution
   */
  async initializeMinecraftUser(mojangProfile: MojangProfile, context: InitializeOptions): Promise<MinecraftUser> {
    const identifier: UserIdentifier = { userId: mojangProfile.id, originInstance: InstanceType.Minecraft }

    let profile: DiscordProfile | undefined
    const userLink = await this.application.core.verification.findByIngame(mojangProfile.id)
    if (userLink !== undefined) {
      profile = this.application.discordInstance.profileById(userLink.discordId, context.guild)
    }

    const user = new User(this.application, this.userContext(), identifier, mojangProfile, profile, userLink)
    assert.ok(user.isMojangUser())
    return user
  }

  /**
   * Initialize a user based on a given data and load all metadata in advance
   * @param identifier most basic data to identify a unique user
   * @param context additional information that might help with constructing user metadata
   * @returns a full initialized object that contains user data at the moment of execution
   */
  async initializeUser(identifier: UserIdentifier, context: InitializeOptions): Promise<User> {
    switch (identifier.originInstance) {
      case InstanceType.Minecraft: {
        const profile = await this.application.mojangApi.profileByUuid(identifier.userId)
        return this.initializeMinecraftUser(profile, context)
      }
      case InstanceType.Discord: {
        const profile = this.application.discordInstance.profileById(identifier.userId, context.guild)
        if (profile !== undefined) return this.initializeDiscordUser(profile, context)
      }
    }

    // default
    return new User(this.application, this.userContext(), identifier, undefined, undefined, undefined)
  }

  private userContext(): ManagerContext {
    return {
      commandsHeat: this.commandsHeat,
      punishments: this.punishments,
      moderation: this.moderationConfiguration
    }
  }
}
