import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, playerNeverPlayedSkyblock, usernameNotExists } from '../common/utility'

// Garden level XP requirements
const GardenLevelXp = [
  0, 70, 100, 140, 240, 600, 1500, 2000, 2500, 3000, 10_000, 10_000, 10_000, 10_000, 10_000
]

// Crop milestone XP requirements (cumulative)
const CropMilestoneXp = [
  0, 10, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000
]

function getGardenLevel(exp: number): number {
  let level = 0
  let remaining = exp
  for (const xp of GardenLevelXp) {
    if (remaining >= xp) {
      remaining -= xp
      level++
    } else {
      break
    }
  }
  return level
}

function getCropMilestoneLevel(collected: number): number {
  let level = 0
  for (let i = 0; i < CropMilestoneXp.length; i++) {
    if (collected >= CropMilestoneXp[i]) {
      level = i
    } else {
      break
    }
  }
  return level
}

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
