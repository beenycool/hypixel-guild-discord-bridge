import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, playerNeverPlayedHypixel, shortenNumber, usernameNotExists } from '../common/utility'

export default class Skywars extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['skywars', 'skywar', 'sw'],
      description: "Returns a player's skywars stats",
      example: `sw %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const player = await context.app.hypixelApi.getPlayer(uuid).catch(() => undefined)
    if (player == undefined) return playerNeverPlayedHypixel(context, givenUsername)

    const stat = player.stats?.skywars
    if (stat === undefined) return `${givenUsername} has never played Skywars.`

    const level = stat.level ?? 0
    const kills = stat.kills ?? 0
    const kdRatio = stat.KDRatio ?? 0
    const wins = stat.wins ?? 0
    const wlRatio = stat.WLRatio ?? 0
    const coins = (stat as unknown as Record<string, unknown>).coins as number | undefined

    return `[${level}✫] ${givenUsername} Kills: ${shortenNumber(kills)} KDR: ${kdRatio.toFixed(2)} | Wins: ${shortenNumber(wins)} WLR: ${wlRatio.toFixed(2)}${coins !== undefined ? ` | Coins: ${shortenNumber(coins)}` : ''}`
  }
}
