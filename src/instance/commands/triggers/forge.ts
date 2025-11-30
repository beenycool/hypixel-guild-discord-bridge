import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getSelectedSkyblockProfileRaw, getUuidIfExists, playerNeverPlayedSkyblock, usernameNotExists } from '../common/utility'
import { formatTime } from '../../../utility/shared-utility'

interface ForgeItem {
  type: string
  id: string
  startTime: number
  slot: number
  notified: boolean
}

// Forge item names mapping
const ForgeItemNames: Record<string, string> = {
  /* eslint-disable @typescript-eslint/naming-convention */
  REFINED_DIAMOND: 'Refined Diamond',
  REFINED_MITHRIL: 'Refined Mithril',
  REFINED_TITANIUM: 'Refined Titanium',
  FUEL_TANK: 'Fuel Tank',
  BEJEWELED_HANDLE: 'Bejeweled Handle',
  DRILL_ENGINE: 'Drill Engine',
  GOLDEN_PLATE: 'Golden Plate',
  MITHRIL_PLATE: 'Mithril Plate',
  GEMSTONE_MIXTURE: 'Gemstone Mixture',
  PERFECT_JADE_GEM: 'Perfect Jade',
  PERFECT_AMBER_GEM: 'Perfect Amber',
  PERFECT_TOPAZ_GEM: 'Perfect Topaz',
  PERFECT_SAPPHIRE_GEM: 'Perfect Sapphire',
  PERFECT_AMETHYST_GEM: 'Perfect Amethyst',
  PERFECT_JASPER_GEM: 'Perfect Jasper',
  PERFECT_RUBY_GEM: 'Perfect Ruby',
  TITANIUM_TALISMAN: 'Titanium Talisman',
  TITANIUM_RING: 'Titanium Ring',
  TITANIUM_ARTIFACT: 'Titanium Artifact',
  TITANIUM_RELIC: 'Titanium Relic'
  /* eslint-enable @typescript-eslint/naming-convention */
}

// Forge times in milliseconds
const ForgeTimes: Record<string, number> = {
  /* eslint-disable @typescript-eslint/naming-convention */
  REFINED_DIAMOND: 8 * 60 * 60 * 1000,
  REFINED_MITHRIL: 6 * 60 * 60 * 1000,
  REFINED_TITANIUM: 12 * 60 * 60 * 1000,
  FUEL_TANK: 10 * 60 * 60 * 1000,
  BEJEWELED_HANDLE: 30 * 60 * 1000,
  DRILL_ENGINE: 30 * 60 * 60 * 1000,
  GOLDEN_PLATE: 6 * 60 * 60 * 1000,
  MITHRIL_PLATE: 18 * 60 * 60 * 1000,
  GEMSTONE_MIXTURE: 4 * 60 * 60 * 1000,
  PERFECT_JADE_GEM: 12 * 60 * 60 * 1000,
  PERFECT_AMBER_GEM: 12 * 60 * 60 * 1000,
  PERFECT_TOPAZ_GEM: 12 * 60 * 60 * 1000,
  PERFECT_SAPPHIRE_GEM: 12 * 60 * 60 * 1000,
  PERFECT_AMETHYST_GEM: 12 * 60 * 60 * 1000,
  PERFECT_JASPER_GEM: 12 * 60 * 60 * 1000,
  PERFECT_RUBY_GEM: 12 * 60 * 60 * 1000,
  TITANIUM_TALISMAN: 12 * 60 * 60 * 1000,
  TITANIUM_RING: 12 * 60 * 60 * 1000,
  TITANIUM_ARTIFACT: 12 * 60 * 60 * 1000,
  TITANIUM_RELIC: 12 * 60 * 60 * 1000
  /* eslint-enable @typescript-eslint/naming-convention */
}

export default class Forge extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['forge'],
      description: "Returns a player's forge status",
      example: `forge %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const profile = await getSelectedSkyblockProfileRaw(context.app.hypixelApi, uuid)
    if (!profile) return playerNeverPlayedSkyblock(context, givenUsername)

    const mining = profile.mining_core
    if (!mining?.nodes) return `${givenUsername} has never gone to Dwarven Mines.`

    const forgeProcesses = mining.nodes.forge_processes as Record<string, Record<string, ForgeItem>> | undefined
    if (!forgeProcesses) return `${givenUsername} has no items in their forge.`

    const forgeItems: string[] = []
    for (const [, slots] of Object.entries(forgeProcesses)) {
      for (const [slotNum, item] of Object.entries(slots)) {
        if (!item || !item.id) continue

        const itemName = ForgeItemNames[item.id] ?? item.id.replaceAll('_', ' ')
        const forgeTime = ForgeTimes[item.id]
        if (forgeTime === undefined) {
          // Log missing forge time for debugging
          console.warn(`Missing forge time for item: ${item.id}`)
          continue
        }
        const endTime = item.startTime + forgeTime
        const now = Date.now()

        let status: string
        if (now >= endTime) {
          status = 'Done!'
        } else {
          status = `${formatTime(endTime - now)} left`
        }

        forgeItems.push(`Slot ${slotNum}: ${itemName} (${status})`)
      }
    }

    if (forgeItems.length === 0) return `${givenUsername} has no items in their forge.`

    return `${givenUsername}'s Forge: ${forgeItems.join(' | ')}`
  }
}

