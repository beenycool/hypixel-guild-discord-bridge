import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, playerNeverPlayedHypixel, usernameNotExists } from '../common/utility'

export default class UHC extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['uhc'],
      description: "Returns a player's UHC stats",
      example: `uhc %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const player = await context.app.hypixelApi.getPlayer(uuid).catch(() => undefined)
    if (player == undefined) return playerNeverPlayedHypixel(context, givenUsername)

    const uhc = player.stats?.uhc
    if (uhc == undefined) return `${givenUsername} has no UHC stats.`

    const starLevel = uhc.starLevel ?? 0
    const kdRatio = uhc.KDRatio ?? 0
    const wins = uhc.wins ?? 0
    const headsEaten = uhc.headsEaten ?? 0

    return `[${starLevel}✫] ${givenUsername} | KDR: ${kdRatio.toFixed(2)} | W: ${wins} | Heads: ${headsEaten}`
  }
}

