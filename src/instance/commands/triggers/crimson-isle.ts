import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import {
  capitalize,
  getSelectedSkyblockProfileRaw,
  getUuidIfExists,
  playerNeverEnteredCrimson,
  playerNeverPlayedSkyblock,
  shortenNumber,
  usernameNotExists
} from '../common/utility'

export default class CrimsonIsle extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['crimsonisle', 'crimson', 'nether', 'isle'],
      description: "Returns a player's Crimson Isle stats",
      example: `crimson %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const profile = await getSelectedSkyblockProfileRaw(context.app.hypixelApi, uuid)
    if (!profile) return playerNeverPlayedSkyblock(context, givenUsername)

    const nether = profile.nether_island_player_data
    if (!nether) return playerNeverEnteredCrimson(givenUsername)

    const faction = nether.selected_faction ? capitalize(nether.selected_faction) : 'None'
    const barbarianRep = nether.barbarians_reputation ?? 0
    const mageRep = nether.mages_reputation ?? 0

    return `${givenUsername}'s Faction: ${faction} | Barbarian Reputation: ${shortenNumber(barbarianRep)} | Mage Reputation: ${shortenNumber(mageRep)}`
  }
}

