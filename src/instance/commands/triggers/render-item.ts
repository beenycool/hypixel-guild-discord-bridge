import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { decodeInventoryData, renderLore } from '../common/lore-renderer.js'
import { getSelectedSkyblockProfileRaw, getUuidIfExists, playerNeverPlayedSkyblock, usernameNotExists } from '../common/utility'

export default class RenderItem extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['render', 'inv', 'i', 'inventory'],
      description: "Renders an item from a player's inventory by slot number",
      example: `render %s 1`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const args = context.args
    let givenUsername = context.username
    let slotNumber: number | undefined

    // Parse arguments - can be: [slot], [username slot], [username]
    if (args.length === 0) {
      return `Wrong Usage: ${context.commandPrefix}render [username] [slot]`
    }

    // Check if first arg is a number (slot)
    if (!isNaN(Number(args[0]))) {
      slotNumber = parseInt(args[0])
      givenUsername = args[1] ?? context.username
    } else {
      givenUsername = args[0]
      if (!isNaN(Number(args[1]))) {
        slotNumber = parseInt(args[1])
      } else {
        return `Wrong Usage: ${context.commandPrefix}render [username] [slot]`
      }
    }

    if (slotNumber === undefined || slotNumber < 1 || slotNumber > 36) {
      return `Invalid slot number. Must be between 1 and 36.`
    }

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const profile = await getSelectedSkyblockProfileRaw(context.app.hypixelApi, uuid)
    if (!profile) return playerNeverPlayedSkyblock(context, givenUsername)

    const inventoryData = profile.inventory?.inv_contents?.data
    if (!inventoryData) {
      return `${givenUsername} has Inventory API disabled.`
    }

    try {
      const items = await decodeInventoryData(inventoryData)
      const item = items[slotNumber - 1]
      const display = item?.tag?.value?.display?.value

      if (!item || !display?.Name?.value || !display?.Lore?.value) {
        return `${givenUsername} does not have an item at slot ${slotNumber}.`
      }

      const name = display.Name.value
      const lore = display.Lore.value

      const renderedItem = renderLore(name, lore)
      if (!renderedItem) {
        return `Item at slot ${slotNumber} is not renderable.`
      }

      context.sendImage(renderedItem)
      return `${givenUsername}'s item at slot ${slotNumber} has been rendered, check Discord for the image.`
    } catch (error) {
      context.logger.error('Error rendering item', error)
      return `${context.username}, an error occurred while rendering the item.`
    }
  }
}

