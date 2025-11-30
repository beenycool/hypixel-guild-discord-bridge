import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import {
  getSelectedSkyblockProfile,
  getUuidIfExists,
  playerNeverPlayedSkyblock,
  shortenNumber,
  usernameNotExists
} from '../common/utility'

export default class Skyblock extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['skyblock', 'stats', 'sb'],
      description: "Returns a player's overall Skyblock stats",
      example: `sb %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const profile = await getSelectedSkyblockProfile(context.app.hypixelApi, uuid).catch(() => undefined)
    if (!profile) return playerNeverPlayedSkyblock(context, givenUsername)

    // Skyblock Level
    const sbLevel = (profile.level ?? 0).toFixed(0)

    // Skill Average
    const skillAvg = (profile.skills?.average ?? 0).toFixed(1)

    // Slayer
    const slayers = profile.slayer
    const slayerParts: string[] = []
    if (slayers) {
      if (slayers.zombie) slayerParts.push(`${slayers.zombie.level}Z`)
      if (slayers.spider) slayerParts.push(`${slayers.spider.level}S`)
      if (slayers.wolf) slayerParts.push(`${slayers.wolf.level}W`)
      if (slayers.enderman) slayerParts.push(`${slayers.enderman.level}E`)
      if (slayers.blaze) slayerParts.push(`${slayers.blaze.level}B`)
      if (slayers.vampire) slayerParts.push(`${slayers.vampire.level}V`)
    }
    const slayerText = slayerParts.length > 0 ? slayerParts.join(', ') : 'None'

    // Dungeons
    const dungeons = profile.dungeons
    const cataLevel = dungeons?.experience?.level ?? 0
    const classLevels = dungeons
      ? [dungeons.classes.healer, dungeons.classes.mage, dungeons.classes.berserk, dungeons.classes.archer, dungeons.classes.tank]
          .map((cls) => cls.level ?? 0)
      : []
    const classAvgNumber = classLevels.length > 0 ? classLevels.reduce((sum, level) => sum + level, 0) / classLevels.length : 0
    const classAvg = classAvgNumber.toFixed(1)

    // Networth (if available)
    const networth = await profile
      .getNetworth()
      .then((result) => result?.networth ?? 0)
      .catch(() => 0)

    // Magical Power
    const mp = profile.highestMagicalPower ?? 0

    // HOTM
    const hotm = profile.hotm?.experience?.level ?? 0

    return `${givenUsername}'s Level: ${sbLevel} | Skill Avg: ${skillAvg} | Slayer: ${slayerText} | Cata: ${cataLevel} | Class Avg: ${classAvg} | NW: ${shortenNumber(networth)} | MP: ${shortenNumber(mp)} | Hotm: ${hotm}`
  }
}
