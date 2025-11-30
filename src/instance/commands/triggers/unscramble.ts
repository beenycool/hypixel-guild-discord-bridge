import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'

// Simple word list for unscrambling
const WORDS = [
  'apple', 'banana', 'cherry', 'dragon', 'elephant', 'forest', 'garden', 'hammer', 'island', 'jungle',
  'knight', 'lizard', 'monkey', 'nature', 'orange', 'planet', 'quiver', 'rabbit', 'sunset', 'tiger',
  'uncle', 'violet', 'wizard', 'xylophone', 'yellow', 'zebra', 'castle', 'desert', 'engine', 'flower',
  'guitar', 'harbor', 'insect', 'jacket', 'kitten', 'laptop', 'magnet', 'needle', 'ocean', 'pencil',
  'quarry', 'rocket', 'saddle', 'temple', 'united', 'valley', 'window', 'xenon', 'yogurt', 'zipper'
]

function getRandomWord(length?: number): string {
  let candidates = WORDS
  if (length) {
    candidates = WORDS.filter((word) => word.length === length)
  }
  if (candidates.length === 0) {
    candidates = WORDS
  }
  return candidates[Math.floor(Math.random() * candidates.length)]
}

function scrambleWord(word: string): string {
  const chars = word.split('')
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export default class Unscramble extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['unscramble', 'unscrambleme', 'us'],
      description: 'Unscramble the word and type it in chat to win!',
      example: `unscramble 5`
    })
  }

  handler(context: ChatCommandContext): string {
    const lengthArg = context.args[0]
    const length = lengthArg ? parseInt(lengthArg) : undefined

    const answer = getRandomWord(length)
    const scrambledWord = scrambleWord(answer)

    // Note: This simplified version doesn't listen for chat responses
    // The original used bot event listeners which aren't available in this architecture
    return `Unscramble the following word: "${scrambledWord}" (Answer: ${answer})`
  }
}

