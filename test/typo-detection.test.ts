import {
  calculateSimilarityScore,
  ChatCommandHandler,
  getClosestCommand,
  getCommandSuggestions
} from '../src/common/commands.js'

// Mock command class for testing
class TestCommand extends ChatCommandHandler {
  constructor(triggers: string[]) {
    super({
      triggers,
      description: 'Test command',
      example: 'test'
    })
  }

  async handler() {
    return 'test response'
  }
}

// Mock commands for testing
const mockCommands = [
  new TestCommand(['help']),
  new TestCommand(['player']),
  new TestCommand(['guild']),
  new TestCommand(['skills']),
  new TestCommand(['duels']),
  new TestCommand(['bedwars']),
  new TestCommand(['skyblock']),
  new TestCommand(['networth'])
]

describe('Typo Detection and Suggestion', () => {
  test('should find exact matches', () => {
    const suggestions = getCommandSuggestions(mockCommands, 'help')
    expect(suggestions.length).toBe(1)
    expect(suggestions[0].command.triggers).toContain('help')
    expect(suggestions[0].score).toBe(100)
  })

  test('should suggest similar commands for typos', () => {
    const suggestions = getCommandSuggestions(mockCommands, 'helps')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions[0].command.triggers).toContain('help')
  })

  test('should suggest similar commands for partial matches', () => {
    const suggestions = getCommandSuggestions(mockCommands, 'play')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions[0].command.triggers).toContain('player')
  })

  test('should get closest command', () => {
    const closest = getClosestCommand(mockCommands, 'skil')
    expect(closest).not.toBeNull()
    expect(closest?.command.triggers).toContain('skills')
  })

  test('should calculate similarity scores correctly', () => {
    expect(calculateSimilarityScore('help', 'help')).toBe(1)
    expect(calculateSimilarityScore('hel', 'help')).toBeGreaterThan(0.5)
    expect(calculateSimilarityScore('xyz', 'help')).toBeLessThan(0.3)
  })

  test('should return null for no close matches', () => {
    const closest = getClosestCommand(mockCommands, 'nonexistentcommand123')
    expect(closest).toBeNull()
  })

  test('should handle case insensitivity', () => {
    const suggestions = getCommandSuggestions(mockCommands, 'HELP')
    expect(suggestions.length).toBe(1)
    expect(suggestions[0].command.triggers).toContain('help')
  })
})
