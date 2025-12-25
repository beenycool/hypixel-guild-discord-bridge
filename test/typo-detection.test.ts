import assert from 'node:assert'
import { describe, test } from 'node:test'

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

void describe('Typo Detection and Suggestion', () => {
  void test('should find exact matches', () => {
    const suggestions = getCommandSuggestions(mockCommands, 'help')
    assert.strictEqual(suggestions.length, 1)
    assert.ok(suggestions[0].command.triggers.includes('help'))
    assert.strictEqual(suggestions[0].score, 100)
  })

  void test('should suggest similar commands for typos', () => {
    const suggestions = getCommandSuggestions(mockCommands, 'helps')
    assert.ok(suggestions.length > 0)
    assert.ok(suggestions[0].command.triggers.includes('help'))
  })

  void test('should suggest similar commands for partial matches', () => {
    const suggestions = getCommandSuggestions(mockCommands, 'play')
    assert.ok(suggestions.length > 0)
    assert.ok(suggestions[0].command.triggers.includes('player'))
  })

  void test('should get closest command', () => {
    const closest = getClosestCommand(mockCommands, 'skil')
    assert.notStrictEqual(closest, null)
    assert.ok(closest?.command.triggers.includes('skills'))
  })

  void test('should calculate similarity scores correctly', () => {
    assert.strictEqual(calculateSimilarityScore('help', 'help'), 1)
    assert.ok(calculateSimilarityScore('hel', 'help') > 0.5)
    assert.ok(calculateSimilarityScore('xyz', 'help') < 0.3)
  })

  void test('should return null for no close matches', () => {
    const closest = getClosestCommand(mockCommands, 'nonexistentcommand123')
    assert.strictEqual(closest, null)
  })

  void test('should handle case insensitivity', () => {
    const suggestions = getCommandSuggestions(mockCommands, 'HELP')
    assert.strictEqual(suggestions.length, 1)
    assert.ok(suggestions[0].command.triggers.includes('help'))
  })
})
