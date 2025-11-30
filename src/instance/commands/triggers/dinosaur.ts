import DefaultAxios from 'axios'

import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'

export default class Dinosaur extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['dinosaur', 'dino'],
      description: 'Returns a random dinosaur image URL',
      example: `dino`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const response = await DefaultAxios.get<{ url?: string }>('https://imgs.kath.lol/dinosaur', { timeout: 5000 }).catch(() => undefined)

    if (!response || response.status !== 200 || !response.data?.url) {
      return `${context.username}, failed to fetch dinosaur image. Try again later.`
    }

    return `${context.username}, here's a dinosaur: ${response.data.url}`
  }
}

