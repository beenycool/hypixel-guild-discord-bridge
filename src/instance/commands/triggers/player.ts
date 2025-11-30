import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, playerNeverPlayedHypixel, shortenNumber, usernameNotExists } from '../common/utility'

export default class Player extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['player'],
      description: "Returns a player's general Hypixel stats",
      example: `player %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const player = await context.app.hypixelApi.getPlayer(uuid, { guild: true }).catch(() => undefined)
    if (player == undefined) return playerNeverPlayedHypixel(context, givenUsername)

    const rank = player.rank !== 'Default' ? `[${player.rank}] ` : ''
    const level = player.level ?? 0
    const karma = player.karma ?? 0
    const achievementPoints = player.achievementPoints ?? 0
    const guildName = player.guild?.name ?? 'None'

    return `${rank}${givenUsername}'s level: ${level.toFixed(0)} | Karma: ${shortenNumber(karma)} | Achievement Points: ${shortenNumber(achievementPoints)} | Guild: ${guildName}`
  }
}

