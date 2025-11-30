import DefaultAxios from 'axios'

import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'

export default class Picket extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['picket', 'soupybunny', 'bestrabbit'],
      description: 'Returns a random picket image URL',
      example: `picket`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const response = await DefaultAxios.get<{ url?: string }>('https://imgs.kath.lol/picket').catch(() => undefined)

    if (!response || response.status !== 200 || !response.data?.url) {
      return `${context.username}, failed to fetch picket image. Try again later.`
    }

    return `${context.username}, here's picket: ${response.data.url}`
  }
}

