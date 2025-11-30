import DefaultAxios from 'axios'

import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'

export default class Kitty extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['kitty', 'cat', 'cutecat'],
      description: 'Returns a random cute cat image URL',
      example: `kitty`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const response = await DefaultAxios.get<{ url?: string }[]>('https://api.thecatapi.com/v1/images/search', { timeout: 5000 }).catch(
      () => undefined
    )

    if (!response || !response.data?.[0]?.url) {
      return `${context.username}, failed to fetch cat image. Try again later.`
    }

    return `${context.username}, here's a kitty: ${response.data[0].url}`
  }
}

