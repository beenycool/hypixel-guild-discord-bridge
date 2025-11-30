import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import {
  getSelectedSkyblockProfileRaw,
  getUuidIfExists,
  playerNeverEnteredCrimson,
  playerNeverPlayedSkyblock,
  shortenNumber,
  usernameNotExists
} from '../common/utility'

const TrophyFishRanks = ['Bronze', 'Silver', 'Gold', 'Diamond']

function getTrophyFishRank(totalCaught: number): string {
  if (totalCaught >= 1000) return 'Diamond'
  if (totalCaught >= 100) return 'Gold'
  if (totalCaught >= 30) return 'Silver'
  return 'Bronze'
}

export default class TrophyFish extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['trophyfish', 'tf', 'trophyfishing', 'trophy'],
      description: "Returns a player's Trophy Fish stats",
      example: `tf %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const profile = await getSelectedSkyblockProfileRaw(context.app.hypixelApi, uuid)
    if (!profile) return playerNeverPlayedSkyblock(context, givenUsername)

    const trophyFish = profile.trophy_fish
    if (!trophyFish) return playerNeverEnteredCrimson(givenUsername)

    const totalCaught = trophyFish.total_caught ?? 0
    const rank = getTrophyFishRank(totalCaught)

    // Count fish by tier
    let bronze = 0
    let silver = 0
    let gold = 0
    let diamond = 0

    for (const [key, value] of Object.entries(trophyFish)) {
      if (key === 'total_caught' || key === 'rewards' || key === 'last_caught') continue
      if (typeof value !== 'number') continue

      if (key.endsWith('_bronze')) bronze++
      else if (key.endsWith('_silver')) silver++
      else if (key.endsWith('_gold')) gold++
      else if (key.endsWith('_diamond')) diamond++
    }

    return `${givenUsername}'s Trophy Fishing rank: ${rank} | Caught: ${shortenNumber(totalCaught)} | Bronze: ${bronze}/18 | Silver: ${silver}/18 | Gold: ${gold}/18 | Diamond: ${diamond}/18`
  }
}

