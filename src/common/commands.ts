import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder
} from 'discord.js'
import type { Logger } from 'log4js'

import type Application from '../application.js'

import type { ChatEvent, InstanceType, Permission } from './application-event.js'
import type EventHelper from './event-helper.js'
import type UnexpectedErrorHandler from './unexpected-error-handler.js'
import type { DiscordUser } from './user'

export abstract class ChatCommandHandler {
  public readonly triggers: string[]
  public readonly description: string
  public readonly example: string

  protected constructor(options: { triggers: string[]; description: string; example: string }) {
    this.triggers = options.triggers
    this.description = options.description
    this.example = options.example
  }

  public getExample(commandPrefix: string): string {
    return `Example: ${commandPrefix}${this.example}`
  }

  public abstract handler(context: ChatCommandContext): Promise<string> | string
}

export interface ChatCommandContext {
  app: Application

  eventHelper: EventHelper<InstanceType.Commands>
  logger: Logger
  errorHandler: UnexpectedErrorHandler

  allCommands: ChatCommandHandler[]
  commandPrefix: string

  message: ChatEvent
  username: string
  args: string[]

  sendFeedback: (feedback: string) => Promise<void>
}

export interface DiscordCommandHandler {
  readonly getCommandBuilder: () =>
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
  /**
   * @default OptionToAddMinecraftInstances.Disabled
   */
  readonly addMinecraftInstancesToOptions?: OptionToAddMinecraftInstances
  /**
   * @default CommandScope.Public
   */
  readonly scope?: CommandScope
  /**
   * @default Permission.Anyone
   */
  readonly permission?: Permission

  readonly handler: (context: Readonly<DiscordCommandContext>) => Promise<void>
  readonly autoComplete?: (context: Readonly<DiscordAutoCompleteContext>) => Promise<void>
}

export enum OptionToAddMinecraftInstances {
  Disabled,
  Optional,
  Required
}

export enum CommandScope {
  /**
   * only allow to execute in the registered chat channels
   */
  Chat,
  /**
   * only allow to execute in officer channels
   */
  Privileged,
  /**
   * Allow to execute in any channel anywhere without limitations
   */
  Anywhere
}

interface DiscordContext {
  application: Application
  eventHelper: EventHelper<InstanceType.Discord>
  logger: Logger
  instanceName: string

  user: DiscordUser
  permission: Permission
  errorHandler: UnexpectedErrorHandler

  allCommands: DiscordCommandHandler[]
  bridgeId?: string
}

export interface DiscordCommandContext extends DiscordContext {
  interaction: ChatInputCommandInteraction
  showPermissionDenied: (requiredPermission: Exclude<Permission, Permission.Anyone>) => Promise<void>
}

export interface DiscordAutoCompleteContext extends DiscordContext {
  interaction: AutocompleteInteraction
}

// Utility functions for command help functionality
/**
 *
 * @param commands
 * @param commandName
 */
export function findCommandByName(commands: ChatCommandHandler[], commandName: string): ChatCommandHandler | undefined {
  const lowerName = commandName.toLowerCase()
  return commands.find((cmd) => cmd.triggers.some((trigger) => trigger.toLowerCase() === lowerName))
}

/**
 *
 * @param command
 * @param commandPrefix
 * @param username
 */
export function formatCommandHelp(command: ChatCommandHandler, commandPrefix: string, username?: string): string {
  const example = username ? command.example.replaceAll('%s', username) : command.example
  return `${command.triggers[0]}: ${command.description} (${commandPrefix}${example})`
}

/**
 *
 * @param commands
 * @param query
 * @param limit
 */
export function getCommandSuggestions(
  commands: ChatCommandHandler[],
  query: string,
  limit = 3
): { command: ChatCommandHandler; score: number; trigger: string }[] {
  const lowerQuery = query.toLowerCase()
  const suggestions: { command: ChatCommandHandler; score: number; trigger: string }[] = []

  for (const command of commands) {
    for (const trigger of command.triggers) {
      const lowerTrigger = trigger.toLowerCase()

      // Exact match gets highest score
      if (lowerTrigger === lowerQuery) {
        suggestions.push({ command, score: 100, trigger })
        continue
      }

      // Prefix match gets good score
      if (lowerTrigger.startsWith(lowerQuery)) {
        suggestions.push({ command, score: 80 - lowerTrigger.length, trigger })
        continue
      }

      // Contains match gets lower score
      if (lowerTrigger.includes(lowerQuery)) {
        suggestions.push({ command, score: 60 - lowerTrigger.length, trigger })
        continue
      }

      // Levenshtein distance for typo tolerance (simplified)
      const distance = calculateLevenshteinDistance(lowerQuery, lowerTrigger)
      if (distance <= 2) {
        suggestions.push({ command, score: 40 - distance * 10, trigger })
      }
    }
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 *
 * @param commands
 * @param query
 */
export function getClosestCommand(
  commands: ChatCommandHandler[],
  query: string
): { command: ChatCommandHandler; score: number; trigger: string } | null {
  const suggestions = getCommandSuggestions(commands, query, 1)
  return suggestions.length > 0 ? suggestions[0] : null
}

/**
 *
 * @param query
 * @param target
 */
export function calculateSimilarityScore(query: string, target: string): number {
  const lowerQuery = query.toLowerCase()
  const lowerTarget = target.toLowerCase()

  // Exact match
  if (lowerQuery === lowerTarget) return 1

  // Prefix match
  if (lowerTarget.startsWith(lowerQuery)) {
    return 0.8 - (lowerTarget.length - lowerQuery.length) * 0.1
  }

  // Contains match
  if (lowerTarget.includes(lowerQuery)) {
    return 0.6 - (lowerTarget.length - lowerQuery.length) * 0.1
  }

  // Levenshtein distance based similarity
  const distance = calculateLevenshteinDistance(lowerQuery, lowerTarget)
  const maxLength = Math.max(lowerQuery.length, lowerTarget.length)
  const similarity = 1 - distance / maxLength

  return Math.max(0, similarity * 0.4) // Max 0.4 for typo matches
}

/**
 *
 * @param string1
 * @param str2
 * @param string2
 */
function calculateLevenshteinDistance(string1: string, string2: string): number {
  const matrix: number[][] = Array.from({ length: string2.length + 1 }, () =>
    new Array(string1.length + 1).fill(0)
  )

  for (let index = 0; index <= string1.length; index++) matrix[0][index] = index
  for (let index = 0; index <= string2.length; index++) matrix[index][0] = index

  for (let index = 1; index <= string2.length; index++) {
    for (let index_ = 1; index_ <= string1.length; index_++) {
      const indicator = string1[index_ - 1] === string2[index - 1] ? 0 : 1
      matrix[index][index_] = Math.min(
        matrix[index][index_ - 1] + 1, // deletion
        matrix[index - 1][index_] + 1, // insertion
        matrix[index - 1][index_ - 1] + indicator // substitution
      )
    }
  }

  return matrix[string2.length][string1.length]
}
