import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { getUuidIfExists, shortenNumber, usernameNotExists } from '../common/utility'

export default class AuctionHouse extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['auction', 'ah', 'auctions'],
      description: "Returns a player's active auctions",
      example: `ah %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const auctions = await context.app.hypixelApi.getSkyblockAuction('PLAYER', uuid).catch(() => undefined)
    if (!auctions || auctions.length === 0) return `${givenUsername} has no active auctions.`

    const activeAuctions = auctions.filter((auction) => !auction.claimed && (auction.auctionEnd?.getTime() ?? 0) >= Date.now())
    if (activeAuctions.length === 0) return `${givenUsername} has no active auctions.`

    const auctionSummaries = activeAuctions.slice(0, 5).map((auction) => {
      const price = auction.bids.length > 0 ? auction.highestBid : auction.startingBid
      const type = auction.bin ? 'BIN' : 'AUC'
      const itemName = auction.item ?? 'Unknown Item'
      return `${itemName} (${type}: ${shortenNumber(price)})`
    })

    const remaining = activeAuctions.length > 5 ? ` (+${activeAuctions.length - 5} more)` : ''
    return `${givenUsername}'s Auctions: ${auctionSummaries.join(' | ')}${remaining}`
  }
}
