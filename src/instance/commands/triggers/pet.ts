import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import {
  capitalize,
  getSelectedSkyblockProfile,
  getUuidIfExists,
  playerNeverPlayedSkyblock,
  usernameNotExists
} from '../common/utility'

export default class Pet extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['pet', 'pets'],
      description: "Returns a player's active pet",
      example: `pet %s`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const givenUsername = context.args[0] ?? context.username

    const uuid = await getUuidIfExists(context.app.mojangApi, givenUsername)
    if (uuid == undefined) return usernameNotExists(context, givenUsername)

    const profile = await getSelectedSkyblockProfile(context.app.hypixelApi, uuid).catch(() => undefined)
    if (!profile) return playerNeverPlayedSkyblock(context, givenUsername)

    const pets = profile.pets ?? []
    if (pets.length === 0) return `${givenUsername} does not have any pets.`

    const activePet = pets.find((pet) => pet.active === true)
    if (!activePet) return `${givenUsername} does not have a pet equipped.`

    const tier = capitalize(activePet.rarity ?? 'common')
    const type = capitalize((activePet.type ?? 'unknown').replaceAll('_', ' '))

    return `${givenUsername}'s Active Pet: ${tier} ${type}`
  }
}
