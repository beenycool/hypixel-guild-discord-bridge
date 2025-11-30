import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, playerNeverPlayedHypixel, usernameNotExists } from '../common/utility'

export default class Megawalls extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['megawalls', 'mw'],
      description: "Returns a player's Mega Walls stats",
      example: `mw %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const player = await context.app.hypixelApi.getPlayer(uuid).catch(() => undefined)
    if (player == undefined) return playerNeverPlayedHypixel(context, givenUsername)

    const megawalls = player.stats?.megawalls
    if (megawalls == undefined) return `${givenUsername} has no Mega Walls stats.`

    const selectedClass = megawalls.selectedClass ?? 'None'
    const finalKills = megawalls.finalKills ?? 0
    const finalKDRatio = megawalls.finalKDRatio ?? 0
    const wins = megawalls.wins ?? 0
    const wlRatio = megawalls.WLRatio ?? 0
    const kills = megawalls.kills ?? 0
    const kdRatio = megawalls.KDRatio ?? 0
    const assists = megawalls.assists ?? 0

    return `${givenUsername}'s Mega Walls: Class: ${selectedClass} | FK: ${finalKills} | FKDR: ${finalKDRatio.toFixed(2)} | W: ${wins} | WLR: ${wlRatio.toFixed(2)} | K: ${kills} | KDR: ${kdRatio.toFixed(2)} | A: ${assists}`
  }
}

