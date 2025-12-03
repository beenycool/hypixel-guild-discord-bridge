import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, playerNeverPlayedHypixel, usernameNotExists } from '../common/utility'

const DuelTypes = ['blitz', 'uhc', 'parkour', 'boxing', 'bowspleef', 'spleef', 'arena', 'megawalls', 'op', 'sumo', 'classic', 'combo', 'bridge', 'nodebuff', 'bow'] as const

export default class Duels extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['duels', 'duel'],
      description: "Returns a player's duels stats",
      example: `duels %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const args = context.args
    let givenUsername = context.username
    let mode: string | undefined

    // Parse arguments - can be: [username], [mode], [mode username], [username mode]
    if (args.length > 0) {
      const firstArg = args[0]?.toLowerCase()
      if (DuelTypes.includes(firstArg as (typeof DuelTypes)[number])) {
        mode = firstArg
        givenUsername = args[1] ?? context.username
      } else {
        givenUsername = args[0] ?? context.username
        const secondArg = args[1]?.toLowerCase()
        if (secondArg && DuelTypes.includes(secondArg as (typeof DuelTypes)[number])) {
          mode = secondArg
        }
      }
    }

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const player = await context.app.hypixelApi.getPlayer(uuid).catch(() => undefined)
    if (player == undefined) return playerNeverPlayedHypixel(context, givenUsername)

    const duels = player.stats?.duels
    if (duels == undefined) return `${givenUsername} has never played Duels.`

    if (!mode) {
      // Overall stats
      const division = (duels as unknown as Record<string, unknown>).division ?? 'Unknown'
      const wins = Number((duels as any)?.wins ?? 0)
      const winstreak = Number((duels as any)?.winstreak ?? 0)
      const bestWinstreak = Number((duels as any)?.bestWinstreak ?? 0)
      const wlRatio = typeof (duels as any)?.WLRatio === 'number' ? (duels as any).WLRatio : 0
      return `[Duels] [${division}] ${givenUsername} Wins: ${wins.toLocaleString()} | CWS: ${winstreak} | BWS: ${bestWinstreak} | WLR: ${wlRatio.toFixed(2)}`
    }

    // Mode-specific stats
    // The API structure: modeData contains stats objects keyed by mode variant (e.g., "1v1", "2v2")
    // and may also contain a "division" key at the top level
    const modeData = (duels as unknown as Record<string, unknown>)[mode] as Record<string, unknown> | undefined
    if (!modeData) return `${givenUsername} has no ${mode} duels stats.`

    // Filter out known non-stats keys to find the actual stats object
    const statsKeys = Object.keys(modeData).filter((key) => key !== 'division')
    if (statsKeys.length === 0) {
      return `${givenUsername} has no valid ${mode} duels stats.`
    }
    // Use the first valid stats key (typically there's one main stats object per mode)
    const firstKey = statsKeys[0]
    if (!firstKey) {
      return `${givenUsername} has no valid ${mode} duels stats.`
    }
    const modeStats = modeData[firstKey] as Record<string, unknown> | null | undefined
    // Validate it's an object (not null, and typeof === 'object')
    if (modeStats == null || typeof modeStats !== 'object' || Array.isArray(modeStats)) {
      return `${givenUsername} has no valid ${mode} duels stats.`
    }

    const division = (modeStats.division as string) ?? (modeData.division as string) ?? 'Unknown'
    const wins = (modeStats.wins as number) ?? 0
    const winstreak = (modeStats.winstreak as number) ?? 0
    const bestWinstreak = (modeStats.bestWinstreak as number) ?? 0
    const wlRatio = (modeStats.WLRatio as number) ?? 0

    return `[${mode.toUpperCase()}] [${division}] ${givenUsername} Wins: ${wins.toLocaleString()} | CWS: ${winstreak} | BWS: ${bestWinstreak} | WLR: ${wlRatio.toFixed(2)}`
  }
}

