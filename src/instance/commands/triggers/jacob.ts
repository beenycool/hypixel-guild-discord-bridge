import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import {
  capitalize,
  getSelectedSkyblockProfile,
  getUuidIfExists,
  playerNeverPlayedSkyblock,
  shortenNumber,
  usernameNotExists
} from '../common/utility'

export default class Jacob extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['jacob', 'jacobs', 'jacobcontest', 'contest'],
      description: "Returns a player's Jacob's Contest stats",
      example: `jacob %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const profile = await getSelectedSkyblockProfile(context.app.hypixelApi, uuid).catch(() => undefined)
    if (!profile) return playerNeverPlayedSkyblock(context, givenUsername)

    const jacob = profile.jacob
    if (!jacob) return `${givenUsername} does not have Jacob's Contest stats.`

    const medals = jacob.medals ?? { gold: 0, silver: 0, bronze: 0 }
    const gold = medals.gold
    const silver = medals.silver
    const bronze = medals.bronze

    const perks = jacob.perks ?? {}
    const doubleDrops = perks.doubleDrops ?? 0
    const levelCap = perks.farmingLevelCap ?? 0

    // Get personal bests from contests
    const contests = jacob.contests ?? {}
    const personalBests: Record<string, number> = {}

    for (const [contestKey, contestData] of Object.entries(contests)) {
      // Contest key format: "123:4_5:CROP_NAME"
      const parts = contestKey.split(':')
      const cropName = parts[parts.length - 1]
      const collected = (contestData as { collected?: number }).collected ?? 0

      if (!personalBests[cropName] || collected > personalBests[cropName]) {
        personalBests[cropName] = collected
      }
    }

    const pbString = Object.entries(personalBests)
      .map(([crop, amount]) => `${capitalize(crop.toLowerCase().replaceAll('_', ' '))}: ${shortenNumber(amount)}`)
      .slice(0, 5)
      .join(' | ')

    let result = `${givenUsername}'s Gold: ${gold} | Silver: ${silver} | Bronze: ${bronze} | Double Drops: ${doubleDrops}/15 | Level Cap: ${levelCap}/10`
    if (pbString) {
      result += ` | PBs: ${pbString}`
    }

    return result
  }
}
