import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { decodeInventoryData, renderLore } from '../common/lore-renderer.js'
import { getSelectedSkyblockProfileRaw, getUuidIfExists, playerNeverPlayedSkyblock, usernameNotExists } from '../common/utility'

export default class Equipment extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['equipment', 'eq'],
      description: "Returns a player's equipped items (rendered as images)",
      example: `equipment %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const profile = await getSelectedSkyblockProfileRaw(context.app.hypixelApi, uuid)
    if (!profile) return playerNeverPlayedSkyblock(context, givenUsername)

    const equipmentData = profile.inventory?.equipment_contents?.data
    if (!equipmentData) {
      return `${givenUsername} has Inventory API disabled.`
    }

    try {
      const inventoryData = await decodeInventoryData(equipmentData)
      const renderedItems: Buffer[] = []

      for (const piece of inventoryData) {
        const display = piece?.tag?.value?.display?.value
        if (!display?.Name?.value || !display?.Lore?.value) {
          continue
        }

        const name = display.Name.value
        const lore = display.Lore.value

        const renderedItem = renderLore(name, lore)
        if (renderedItem) {
          renderedItems.push(renderedItem)
          context.sendImage(renderedItem)
        }
      }

      if (renderedItems.length === 0) {
        return `${givenUsername} has no equipment equipped.`
      }

      return `${givenUsername}'s equipment has been rendered, check Discord for the images.`
    } catch (error) {
      context.logger.error('Error rendering equipment', error)
      return `${context.username}, an error occurred while rendering equipment.`
    }
  }
}

