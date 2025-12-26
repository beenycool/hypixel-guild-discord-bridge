import type { APIEmbed } from 'discord.js'

const DefaultMaxLength = 3300

/**
 * Split a long text into multiple embed pages based on max length.
 * Tries to split at line breaks; if a single line is longer than maxLen, it will be chunked.
 */
export function splitToEmbeds(base: APIEmbed, text: string, maxLen = DefaultMaxLength): APIEmbed[] {
  const pages: APIEmbed[] = []
  const lines = text.split('\n')

  let current = { ...base, description: '' } as APIEmbed
  let currentLength = 0

  for (const line of lines) {
    const lineWithNewline = line + '\n'

    if (lineWithNewline.length > maxLen) {
      // Chunk very long single lines
      let offset = 0
      while (offset < lineWithNewline.length) {
        const chunk = lineWithNewline.slice(offset, offset + maxLen)
        if (currentLength + chunk.length > maxLen) {
          pages.push(current)
          current = { ...base, description: '' } as APIEmbed
          currentLength = 0
        }
        current.description += chunk
        currentLength += chunk.length
        offset += chunk.length
      }
      continue
    }

    if (currentLength + lineWithNewline.length > maxLen) {
      // start a new page
      pages.push(current)
      current = { ...base, description: '' } as APIEmbed
      currentLength = 0
    }

    current.description += lineWithNewline
    currentLength += lineWithNewline.length
  }

  // push last page
  if ((current.description ?? '').length > 0) pages.push(current)

  return pages
}
