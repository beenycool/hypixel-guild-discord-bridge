import { createCanvas, registerFont } from 'canvas'
import { parse } from 'prismarine-nbt'

// Register Minecraft fonts for lore rendering
// These should already be registered by MessageToImage, but we ensure they're available
try {
  registerFont('./resources/fonts/MinecraftRegular-Bmg3.ttf', { family: 'MinecraftLore' })
  registerFont('./resources/fonts/unifont.ttf', { family: 'MinecraftLoreUnicode' })
} catch {
  // Fonts may already be registered
}

const RGBA_COLOR: Record<string, string> = {
  /* eslint-disable @typescript-eslint/naming-convention */
  '0': 'rgba(0,0,0,1)',
  '1': 'rgba(0,0,170,1)',
  '2': 'rgba(0,170,0,1)',
  '3': 'rgba(0,170,170,1)',
  '4': 'rgba(170,0,0,1)',
  '5': 'rgba(170,0,170,1)',
  '6': 'rgba(255,170,0,1)',
  '7': 'rgba(170,170,170,1)',
  '8': 'rgba(85,85,85,1)',
  '9': 'rgba(85,85,255,1)',
  a: 'rgba(85,255,85,1)',
  b: 'rgba(85,255,255,1)',
  c: 'rgba(255,85,85,1)',
  d: 'rgba(255,85,255,1)',
  e: 'rgba(255,255,85,1)',
  f: 'rgba(255,255,255,1)'
  /* eslint-enable @typescript-eslint/naming-convention */
}

/**
 * Get the width and height of the canvas for lore rendering
 */
function getCanvasWidthAndHeight(lore: string[]): { height: number; width: number } | undefined {
  const canvas = createCanvas(1, 1)
  const ctx = canvas.getContext('2d')
  ctx.font = '24px MinecraftLore, MinecraftLoreUnicode'

  let highestWidth = 0
  if (!lore || lore.length === 0) return undefined

  for (const line of lore) {
    const width = ctx.measureText(line.replaceAll(/§[\da-fk-or]/gi, '')).width
    if (width > highestWidth) {
      highestWidth = width
    }
  }

  return { height: lore.length * 24 + 15, width: highestWidth + 20 }
}

/**
 * Render item lore as an image buffer
 * @param itemName The item name (with color codes)
 * @param lore Array of lore lines (with color codes)
 * @returns Buffer containing the rendered image, or null on error
 */
export function renderLore(itemName: string | undefined, lore: string[]): Buffer | null {
  const lines = [...lore]
  if (itemName) lines.unshift(itemName)

  const measurements = getCanvasWidthAndHeight(lines)
  if (!measurements) return null

  const canvas = createCanvas(measurements.width, measurements.height)
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#100110'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Font settings
  ctx.shadowOffsetX = 3
  ctx.shadowOffsetY = 3
  ctx.shadowColor = '#131313'
  ctx.font = '24px MinecraftLore, MinecraftLoreUnicode'
  ctx.fillStyle = '#ffffff'

  // Render each line
  for (const [index, line] of lines.entries()) {
    let width = 10
    const splitLine = line.split('§')
    if (splitLine[0].length === 0) splitLine.shift()

    // Track formatting state
    let currentColor = '#ffffff'
    let isBold = false
    let isItalic = false
    let isStrikethrough = false
    let isUnderline = false

    for (const segment of splitLine) {
      // Guard against empty segments
      if (segment.length === 0) continue

      const code = segment[0]

      // Handle formatting codes
      if (code === 'l') {
        isBold = true
      } else if (code === 'o') {
        isItalic = true
      } else if (code === 'k') {
        // Obfuscated text (§k) is not rendered in static images
      } else if (code === 'm') {
        isStrikethrough = true
      } else if (code === 'n') {
        isUnderline = true
      } else if (code === 'r') {
        // Reset all formatting
        currentColor = '#ffffff'
        isBold = false
        isItalic = false
        isObfuscated = false
        isStrikethrough = false
        isUnderline = false
      } else {
        // Check if it's a color code
        const color = RGBA_COLOR[code]
        if (color) {
          currentColor = color
        }
      }

      // Apply current color
      ctx.fillStyle = currentColor

      // Build font string based on formatting state
      let fontWeight = ''
      let fontStyle = ''
      if (isBold) fontWeight = 'bold '
      if (isItalic) fontStyle = 'italic '
      ctx.font = `${fontWeight}${fontStyle}24px MinecraftLore, MinecraftLoreUnicode`

      const text = segment.slice(1)
      if (text.length > 0) {
        ctx.fillText(text, width, index * 24 + 24)

        // Apply strikethrough and underline if needed
        if (isStrikethrough) {
          const textMetrics = ctx.measureText(text)
          const y = index * 24 + 24
          ctx.strokeStyle = currentColor
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(width, y - 6)
          ctx.lineTo(width + textMetrics.width, y - 6)
          ctx.stroke()
        }
        if (isUnderline) {
          const textMetrics = ctx.measureText(text)
          const y = index * 24 + 24
          ctx.strokeStyle = currentColor
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(width, y + 6)
          ctx.lineTo(width + textMetrics.width, y + 6)
          ctx.stroke()
        }

        width += ctx.measureText(text).width
      }
    }
  }

  return canvas.toBuffer()
}

/**
 * Decode NBT inventory data from base64
 */
export async function decodeInventoryData(base64Data: string): Promise<InventoryItem[]> {
  try {
    const buffer = Buffer.from(base64Data, 'base64')
    const parsed = await parse(buffer)

    // Validate nested structure before accessing
    if (
      parsed?.parsed?.value?.i?.value?.value &&
      Array.isArray(parsed.parsed.value.i.value.value)
    ) {
      // @ts-expect-error too nested - accessing NBT structure directly
      return parsed.parsed.value.i.value.value as unknown as InventoryItem[]
    }

    // Return empty array if structure doesn't match expected format
    return []
  } catch (error) {
    // Log error for debugging visibility
    console.error('Failed to parse NBT inventory data:', error)
    return []
  }
}

/**
 * Format lore lines for text output (stripping color codes)
 */
export function formatLoreAsText(itemName: string | undefined, lore: string[]): string {
  const lines: string[] = []
  if (itemName) {
    lines.push(stripColorCodes(itemName))
  }
  for (const line of lore) {
    lines.push(stripColorCodes(line))
  }
  return lines.join(' | ')
}

/**
 * Strip Minecraft color codes from text
 */
export function stripColorCodes(text: string): string {
  return text.replaceAll(/§[\da-fk-or]/gi, '')
}

/**
 * Format lore for the existing MessageToImage renderer
 * Converts item lore to a format that MessageToImage can render
 */
export function formatLoreForMessageToImage(itemName: string | undefined, lore: string[]): string {
  const lines: string[] = []
  if (itemName) lines.push(itemName)
  lines.push(...lore)
  // Join with newlines - MessageToImage handles \n for line breaks
  return lines.join('\n')
}

export interface InventoryItem {
  id?: { value: number }
  Count?: { value: number }
  tag?: {
    value: {
      display?: {
        value: {
          Name?: { value: string }
          Lore?: { value: string[] }
        }
      }
      ExtraAttributes?: { value: Record<string, unknown> }
    }
  }
}

export interface PetData {
  type: string
  tier: string
  exp: number
  active: boolean
  heldItem?: string
  candyUsed?: number
  skin?: string
}

