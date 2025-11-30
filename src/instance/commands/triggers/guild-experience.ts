import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, usernameNotExists } from '../common/utility'

export default class GuildExperience extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['guildexp', 'gexp'],
      description: "Returns a player's weekly guild experience",
      example: `gexp %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    let guild
    try {
      guild = await context.app.hypixelApi.getGuild('player', uuid)
    } catch (error: unknown) {
      // Check if the error indicates the player is not in a guild
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
      if (
        errorMessage.includes('not in a guild') ||
        errorMessage.includes('no guild') ||
        errorMessage.includes('guild not found') ||
        (error as any)?.status === 404
      ) {
        return `${givenUsername} is not in a guild.`
      }
      // For other errors (API failures, network issues, etc.), re-throw or log
      throw error
    }

    if (guild == undefined) return `${givenUsername} is not in a guild.`

    const member = guild.members.find((m) => m.uuid === uuid)
    if (member == undefined) return `${givenUsername} is not in the guild.`

    return `${givenUsername}'s Weekly Guild Experience: ${member.weeklyExperience.toLocaleString()}.`
  }
}

