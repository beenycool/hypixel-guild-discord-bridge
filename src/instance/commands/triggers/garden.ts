import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, playerNeverPlayedSkyblock, usernameNotExists } from '../common/utility.js'

export default class Garden extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['garden'],
      description: "Returns a player's garden stats",
      example: `garden %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const profiles = await context.app.hypixelApi.getSkyblockProfiles(uuid, { getGarden: true }).catch(() => undefined)
    if (!profiles || profiles.length === 0) {
      return playerNeverPlayedSkyblock(context, givenUsername)
    }

    const selectedProfile = profiles.find((p) => p.selected)
    if (!selectedProfile) {
      return `${givenUsername} has Skyblock profiles but none are selected. Please select a profile first.`
    }

    const garden = selectedProfile.garden
    if (!garden) return `${givenUsername} does not have a garden.`

    const gardenLevel = garden.level?.level ?? 0
    const crops = garden.cropMilestones
    const wheat = crops.wheat.level ?? 0
    const carrot = crops.carrot.level ?? 0
    const sugarcane = crops.sugarCane.level ?? 0
    const potato = crops.potato.level ?? 0
    const netherwart = crops.netherWart.level ?? 0
    const pumpkin = crops.pumpkin.level ?? 0
    const melon = crops.melon.level ?? 0
    const mushroom = crops.mushroom.level ?? 0
    const cocoa = crops.cocoaBeans.level ?? 0
    const cactus = crops.cactus.level ?? 0

    return `${givenUsername}'s Garden ${gardenLevel} | Crops: Wheat: ${wheat} | Carrot: ${carrot} | Cane: ${sugarcane} | Potato: ${potato} | Wart: ${netherwart} | Pumpkin: ${pumpkin} | Melon: ${melon} | Mushroom: ${mushroom} | Cocoa: ${cocoa} | Cactus: ${cactus}`
  }
}
