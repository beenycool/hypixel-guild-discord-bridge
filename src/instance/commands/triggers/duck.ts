import DefaultAxios from 'axios'

import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'

export default class Duck extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['duck', 'ducky', 'ducks'],
      description: 'Returns a random duck image URL',
      example: `duck`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const response = await DefaultAxios.get<{ url?: string }>('https://imgs.kath.lol/ducky').catch(() => undefined)

    if (!response || response.status !== 200 || !response.data?.url) {
      return `${context.username}, failed to fetch duck image. Try again later.`
    }

    return `${context.username}, here's a duck: ${response.data.url}`
  }
}

