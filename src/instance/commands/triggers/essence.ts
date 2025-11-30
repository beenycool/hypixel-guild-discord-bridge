import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import {
  capitalize,
  getSelectedSkyblockProfileRaw,
  getUuidIfExists,
  playerNeverPlayedSkyblock,
  shortenNumber,
  usernameNotExists
} from '../common/utility'

export default class Essence extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['essence'],
      description: "Returns a player's essence amounts",
      example: `essence %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const profile = await getSelectedSkyblockProfileRaw(context.app.hypixelApi, uuid)
    if (!profile) return playerNeverPlayedSkyblock(context, givenUsername)

    const currencies = profile.currencies
    if (!currencies?.essence) return `${givenUsername} has no essence.`

    const essenceEntries = Object.entries(currencies.essence)
      .filter(([, data]) => (data as { current?: number }).current && (data as { current?: number }).current! > 0)
      .map(([type, data]) => `${capitalize(type.toLowerCase())}: ${shortenNumber((data as { current: number }).current)}`)

    if (essenceEntries.length === 0) return `${givenUsername} has no essence.`

    return `${givenUsername}'s Essence: ${essenceEntries.join(', ')}`
  }
}

