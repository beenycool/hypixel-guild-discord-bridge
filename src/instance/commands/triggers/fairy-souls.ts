import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, playerNeverPlayedSkyblock, usernameNotExists } from '../common/utility.js'

export default class FairySouls extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['fairysouls', 'fs', 'fairy'],
      description: "Returns a player's fairy souls count",
      example: `fs %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const response = await context.app.hypixelApi.getSkyblockProfiles(uuid, { raw: true })
    if (!response.profiles) return playerNeverPlayedSkyblock(context, givenUsername)

    const profileData = response.profiles.find((p) => p.selected)
    if (!profileData) return playerNeverPlayedSkyblock(context, givenUsername)

    const profile = profileData.members[uuid]
    if (!profile) return playerNeverPlayedSkyblock(context, givenUsername)

    const fairySoul = profile.fairy_soul
    if (!fairySoul) return `${givenUsername} has no fairy souls data.`

    // Stranded (island) mode has only 5 fairy souls
    const total = profileData.game_mode === 'island' ? 5 : 253
    const collected = Math.max(0, fairySoul.total_collected ?? 0)
    const clampedCollected = Math.min(collected, total)
    const progress = total <= 0 ? '0.00' : ((clampedCollected / total) * 100).toFixed(2)

    return `${givenUsername}'s Fairy Souls: ${collected} / ${total} | Progress: ${progress}%`
  }
}

