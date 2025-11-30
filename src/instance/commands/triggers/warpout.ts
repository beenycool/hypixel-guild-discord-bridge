import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { canOnlyUseIngame } from '../common/utility'

export default class Warpout extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['warpout', 'warp'],
      description: 'Warp player out of the game (Minecraft only)',
      example: `warpout %s`
    })
  }

  handler(context: ChatCommandContext): string {
    // This command requires direct Minecraft bot interaction which isn't available
    // in the target project's architecture. The source project uses bot.chat() directly.
    // This is a placeholder that indicates the command needs Minecraft instance access.
    return canOnlyUseIngame(context)
  }
}

