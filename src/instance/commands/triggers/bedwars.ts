import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, playerNeverPlayedHypixel, shortenNumber, usernameNotExists } from '../common/utility'

const BedwarsModes = ['solo', 'doubles', 'threes', 'fours', '4v4'] as const

export default class Bedwars extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['bedwars', 'bw', 'bws'],
      description: "Returns a player's bedwars stats (modes: solo, doubles, threes, fours, 4v4)",
      example: `bw [mode] %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const args = context.args
    let givenUsername = context.username
    let mode: string | undefined

    // Parse arguments - can be: [username], [mode], [mode username], [username mode]
    if (args.length > 0) {
      const firstArg = args[0]?.toLowerCase()
      if (BedwarsModes.includes(firstArg as (typeof BedwarsModes)[number])) {
        mode = firstArg
        givenUsername = args[1] ?? context.username
      } else {
        givenUsername = args[0] ?? context.username
        const secondArg = args[1]?.toLowerCase()
        if (secondArg && BedwarsModes.includes(secondArg as (typeof BedwarsModes)[number])) {
          mode = secondArg
        }
      }
    }

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const player = await context.app.hypixelApi.getPlayer(uuid).catch(() => undefined)
    if (player == undefined) return playerNeverPlayedHypixel(context, givenUsername)

    const bedwars = player.stats?.bedwars
    if (bedwars == undefined) return `${givenUsername} has never played Bedwars.`

    if (!mode) {
      // Overall stats
      const level = bedwars.level ?? 0
      const finalKills = bedwars.finalKills ?? 0
      const finalKDRatio = bedwars.finalKDRatio ?? 0
      const wins = bedwars.wins ?? 0
      const wlRatio = bedwars.WLRatio ?? 0
      const beds = (bedwars as unknown as Record<string, unknown>).beds as Record<string, unknown> | undefined
      const bedsBroken = (beds?.broken as number) ?? 0
      const blRatio = (beds?.BLRatio as number) ?? 0
      const winstreak = (bedwars as unknown as Record<string, unknown>).winstreak as number | undefined

      return `[${level}✫] ${givenUsername} FK: ${shortenNumber(finalKills)} FKDR: ${finalKDRatio.toFixed(2)} W: ${shortenNumber(wins)} WLR: ${wlRatio.toFixed(2)} BB: ${shortenNumber(bedsBroken)} BLR: ${blRatio.toFixed(2)}${winstreak !== undefined ? ` WS: ${winstreak}` : ''}`
    }

    // Mode-specific stats
    const modeData = (bedwars as unknown as Record<string, unknown>)[mode] as Record<string, unknown> | undefined
    if (!modeData) return `${givenUsername} has no ${mode} bedwars stats.`

    const level = bedwars.level ?? 0
    const finalKills = (modeData.finalKills as number) ?? 0
    const finalKDRatio = (modeData.finalKDRatio as number) ?? 0
    const wins = (modeData.wins as number) ?? 0
    const wlRatio = (modeData.WLRatio as number) ?? 0
    const beds = modeData.beds as Record<string, unknown> | undefined
    const bedsBroken = (beds?.broken as number) ?? 0
    const blRatio = (beds?.BLRatio as number) ?? 0
    const winstreak = modeData.winstreak as number | undefined

    const modeName = mode.charAt(0).toUpperCase() + mode.slice(1)
    return `[${level}✫] ${givenUsername} ${modeName} FK: ${shortenNumber(finalKills)} FKDR: ${finalKDRatio.toFixed(2)} W: ${shortenNumber(wins)} WLR: ${wlRatio.toFixed(2)} BB: ${shortenNumber(bedsBroken)} BLR: ${blRatio.toFixed(2)}${winstreak !== undefined ? ` WS: ${winstreak}` : ''}`
  }
}
