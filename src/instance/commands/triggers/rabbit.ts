import DefaultAxios from 'axios'

import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'

export default class Rabbit extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['rabbit', 'wabbit'],
      description: 'Returns a random rabbit image URL',
      example: `rabbit`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const response = await DefaultAxios.get<{ url?: string }>('https://imgs.kath.lol/rabbit').catch(() => undefined)

    if (!response || response.status !== 200 || !response.data?.url) {
      return `${context.username}, failed to fetch rabbit image. Try again later.`
    }

    return `${context.username}, here's a rabbit: ${response.data.url}`
  }
}

