import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, playerNeverPlayedHypixel, shortenNumber, usernameNotExists } from '../common/utility'

export default class DuelsSumo extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['duels-sumo', 'dsumo', 'sumo'],
      description: "Returns a player's Sumo Duels stats",
      example: `duels-sumo %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const player = await context.app.hypixelApi.getPlayer(uuid, {}).catch(() => undefined)
    if (player == undefined) return playerNeverPlayedHypixel(context, givenUsername)

    const stats = player.stats?.duels
    if (stats === undefined) return `${givenUsername} has never played Duels.`

    const modeData = (stats as unknown as Record<string, unknown>).sumo
    if (!modeData || typeof modeData !== 'object') {
      return `${givenUsername} has no Sumo Duels stats.`
    }

    const firstKey = Object.keys(modeData)[0]
    const duelData = firstKey ? (modeData as Record<string, unknown>)[firstKey] : modeData
    const dataObject = (typeof duelData === 'object' && duelData !== null ? duelData : modeData) as Record<string, unknown>

    const division = (dataObject.division as string) ?? 'Unknown'
    const wins = dataObject.wins as number
    const winstreak = dataObject.winstreak as number
    const bestWinstreak = dataObject.bestWinstreak as number
    const wlRatio = dataObject.WLRatio as number

    return (
      `[Sumo] [${this.formatDivision(division)}] ${givenUsername} ` +
      `W: ${shortenNumber(wins)} | CWS: ${winstreak} | BWS: ${bestWinstreak} | WLR: ${wlRatio.toFixed(2)}`
    )
  }

  private formatDivision(division: string): string {
    const topTiers = ['celestial', 'divine', 'ascended']
    const lowerDivision = division.toLowerCase()
    for (const tier of topTiers) {
      if (lowerDivision.startsWith(tier)) {
        return division.toUpperCase()
      }
    }
    return division
  }
}
