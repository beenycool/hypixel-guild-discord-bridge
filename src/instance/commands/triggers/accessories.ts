import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import {
  getSelectedSkyblockProfileRaw,
  getUuidIfExists,
  playerNeverPlayedSkyblock,
  shortenNumber,
  usernameNotExists
} from '../common/utility'
import { decodeInventoryData } from '../common/lore-renderer.js'

type AccessoryRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'special' | 'verySpecial'

export default class Accessories extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['accessories', 'acc', 'talismans', 'talisman'],
      description: "Returns a player's accessories/talismans info",
      example: `acc %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const profile = await getSelectedSkyblockProfileRaw(context.app.hypixelApi, uuid).catch(() => undefined)
    if (!profile) return playerNeverPlayedSkyblock(context, givenUsername)

    const talismanBag = profile.inventory?.bag_contents?.talisman_bag
    if (!talismanBag) return `${givenUsername} has Talisman API off.`

    const mp = profile.accessory_bag_storage?.highest_magical_power ?? 0

    const items = await decodeInventoryData(talismanBag.data)
    const counts: Record<AccessoryRarity, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
      mythic: 0,
      special: 0,
      verySpecial: 0
    }

    for (const item of items) {
      const lore = item?.tag?.value?.display?.value?.Lore?.value
      const rarity = this.extractRarity(lore)
      if (rarity) {
        counts[rarity]++
      }
    }

    const total = Object.values(counts).reduce((acc, value) => acc + value, 0)

    const rarities: string[] = []
    if (counts.common > 0) rarities.push(`${counts.common}C`)
    if (counts.uncommon > 0) rarities.push(`${counts.uncommon}U`)
    if (counts.rare > 0) rarities.push(`${counts.rare}R`)
    if (counts.epic > 0) rarities.push(`${counts.epic}E`)
    if (counts.legendary > 0) rarities.push(`${counts.legendary}L`)
    if (counts.mythic > 0) rarities.push(`${counts.mythic}M`)
    if (counts.special > 0) rarities.push(`${counts.special}S`)
    if (counts.verySpecial > 0) rarities.push(`${counts.verySpecial}VS`)

    return `${givenUsername}'s Accessories: ${total} (${shortenNumber(mp)} MP) (${rarities.join(', ')})`
  }

  private extractRarity(lore: string[] | undefined): AccessoryRarity | undefined {
    if (!lore || lore.length === 0) return undefined

    const normalized = lore[lore.length - 1]?.replaceAll(/§[0-9a-fk-or]/gi, '').toUpperCase() ?? ''

    if (normalized.includes('VERY SPECIAL')) return 'verySpecial'
    if (normalized.includes('SPECIAL')) return 'special'
    if (normalized.includes('MYTHIC')) return 'mythic'
    if (normalized.includes('LEGENDARY')) return 'legendary'
    if (normalized.includes('EPIC')) return 'epic'
    if (normalized.includes('RARE')) return 'rare'
    if (normalized.includes('UNCOMMON')) return 'uncommon'
    if (normalized.includes('COMMON')) return 'common'

    return undefined
  }
}
