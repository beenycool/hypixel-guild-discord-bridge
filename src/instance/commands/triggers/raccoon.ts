import DefaultAxios from 'axios'

import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'

export default class Raccoon extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['raccoon', 'raccn'],
      description: 'Returns a random raccoon image URL',
      example: `raccoon`
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const response = await DefaultAxios.get<{ url?: string }>('https://imgs.kath.lol/raccoon', { timeout: 5000 }).catch(() => undefined)

    if (!response || response.status !== 200 || !response.data?.url) {
      return `${context.username}, failed to fetch raccoon image. Try again later.`
    }

    // Extract and validate URL
    const url = response.data.url
    if (typeof url !== 'string' || url.length === 0) {
      return `${context.username}, failed to fetch raccoon image. Try again later.`
    }

    // Validate URL format
    try {
      const urlObj = new URL(url)
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return `${context.username}, failed to fetch raccoon image. Try again later.`
      }
    } catch {
      // URL constructor throws if invalid
      return `${context.username}, failed to fetch raccoon image. Try again later.`
    }

    return `${context.username}, here's a raccoon: ${url}`
  }
}

