import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, playerNeverPlayedHypixel, shortenNumber, usernameNotExists } from '../common/utility'

export default class Woolwars extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['woolwars', 'ww'],
      description: "Returns a player's Wool Wars stats",
      example: `ww %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const player = await context.app.hypixelApi.getPlayer(uuid).catch(() => undefined)
    if (player == undefined) return playerNeverPlayedHypixel(context, givenUsername)

    const woolgames = player.stats?.woolgames
    const woolwars = woolgames?.woolWars
    if (woolwars == undefined) return `${givenUsername} has never played Wool Wars.`

    const level = Math.floor(woolgames?.level ?? 0)

    const roundWins = woolwars.wins ?? 0
    const gamesPlayed = woolwars.gamesPlayed ?? 0
    const woolsPlaced = woolwars.woolsPlaced ?? 0
    const blocksBroken = woolwars.blocksBroken ?? 0
    const kdRatio = woolwars.KDRatio ?? 0

    // Guard against division by zero
    const wlr = gamesPlayed === 0 ? '0.00' : (roundWins / gamesPlayed).toFixed(2)
    const wpp = gamesPlayed === 0 ? '0' : shortenNumber(woolsPlaced / gamesPlayed)
    const wpg = blocksBroken === 0 ? '0.00' : (woolsPlaced / blocksBroken).toFixed(2)

    return `[${level}✫] ${givenUsername}: W: ${shortenNumber(roundWins)} | WLR: ${wlr} | KDR: ${kdRatio.toFixed(2)} | BB: ${shortenNumber(blocksBroken)} | WP: ${shortenNumber(woolsPlaced)} | WPP: ${wpp} | WPG: ${wpg}`
  }
}
