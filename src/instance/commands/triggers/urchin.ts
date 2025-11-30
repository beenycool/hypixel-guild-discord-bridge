import type { AxiosError } from 'axios'
import DefaultAxios from 'axios'

import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'
import { usernameNotExists } from '../common/utility'

interface Tag {
  type: string
  reason: string
  added_by?: number
  added_on: string
  hide_username: boolean
}

interface PlayerResponse {
  uuid: string
  tags: Tag[]
  rate_limit: number
}

export default class Urchin extends ChatCommandHandler {
  private static readonly BaseUrl = 'https://urchin.ws'
  private static readonly DefaultSources = 'MANUAL'

  constructor() {
    super({
      triggers: ['urchin'],
      description: "Look up a player's blacklist tags from Urchin database",
      example: 'urchin %s'
    })
  }

  async handler(context: ChatCommandContext): Promise<string> {
    const apiKey = context.app.getConfig().general.urchinApiKey
    if (!apiKey) {
      return `${context.username}, Urchin API key is not configured. Please contact an administrator.`
    }

    const givenUsername = context.args[0] ?? context.username

    try {
      const response = await DefaultAxios.get<PlayerResponse>(
        `${Urchin.BaseUrl}/player/${encodeURIComponent(givenUsername)}`,
        {
          params: {
            key: apiKey,
            sources: Urchin.DefaultSources
          },
          timeout: 10_000
        }
      )

      const playerData = response.data

      if (playerData.tags.length === 0) {
        return `${givenUsername} has no blacklist tags.`
      }

      const tagStrings = playerData.tags.map((tag) => {
        const parts = [`${tag.type}: ${tag.reason}`]
        if (tag.added_on) {
          const date = new Date(tag.added_on)
          parts.push(`Added: ${date.toLocaleDateString()}`)
        }
        return parts.join(' | ')
      })

      return `${givenUsername} has ${playerData.tags.length} tag(s): ${tagStrings.join(' | ')}`
    } catch (error: unknown) {
      if (DefaultAxios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ detail?: string }>
        const status = axiosError.response?.status

        if (status === 401) {
          return `${context.username}, Invalid Urchin API key. Please contact an administrator.`
        }
        if (status === 403) {
          return `${context.username}, Urchin API key is locked. Please contact an administrator.`
        }
        if (status === 404) {
          return usernameNotExists(context, givenUsername)
        }
        if (status === 429) {
          return `${context.username}, Rate limit exceeded. Please try again later.`
        }

        const detail = axiosError.response?.data?.detail
        if (detail) {
          return `${context.username}, Error: ${detail}`
        }
      }

      context.logger.error('Error while querying Urchin API', error)
      return `${context.username}, Error while querying Urchin API.`
    }
  }
}
