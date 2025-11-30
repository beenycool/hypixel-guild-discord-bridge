import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import {
  getSelectedSkyblockProfileRaw,
  getUuidIfExists,
  playerNeverEnteredCrimson,
  playerNeverPlayedSkyblock,
  shortenNumber,
  usernameNotExists
} from '../common/utility'

const DojoGrades: Record<string, string> = {
  /* eslint-disable @typescript-eslint/naming-convention */
  S: 'Black',
  A: 'Brown',
  B: 'Blue',
  C: 'Green',
  D: 'Yellow',
  F: 'White'
  /* eslint-enable @typescript-eslint/naming-convention */
}

function getDojoGrade(points: number): string {
  if (points >= 1000) return 'S'
  if (points >= 800) return 'A'
  if (points >= 600) return 'B'
  if (points >= 400) return 'C'
  if (points >= 200) return 'D'
  return 'F'
}

function getDojoBelt(totalPoints: number): string {
  const grade = getDojoGrade(Math.floor(totalPoints / 7))
  return DojoGrades[grade] ?? 'White'
}

export default class Dojo extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['dojo'],
      description: "Returns a player's Dojo stats",
      example: `dojo %s`
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

    const dojo = nether.dojo
    if (!dojo) return `${givenUsername} has never done the Dojo.`

    const force = dojo.dojo_points_mob_kb ?? 0
    const stamina = dojo.dojo_points_wall_jump ?? 0
    const mastery = dojo.dojo_points_archer ?? 0
    const discipline = dojo.dojo_points_sword_swap ?? 0
    const swiftness = dojo.dojo_points_snake ?? 0
    const control = dojo.dojo_points_lock_head ?? 0
    const tenacity = dojo.dojo_points_fireball ?? 0

    const totalPoints = force + stamina + mastery + discipline + swiftness + control + tenacity
    const belt = getDojoBelt(totalPoints)

    return `${givenUsername}'s Belt: ${belt} | Force: ${shortenNumber(force)} | Stamina: ${shortenNumber(stamina)} | Mastery: ${shortenNumber(mastery)} | Discipline: ${shortenNumber(discipline)} | Swiftness: ${shortenNumber(swiftness)} | Control: ${shortenNumber(control)} | Tenacity: ${shortenNumber(tenacity)}`
  }
}

