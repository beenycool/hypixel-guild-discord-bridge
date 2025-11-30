import type { ChatCommandContext } from '../../../common/commands.js'
import { ChatCommandHandler } from '../../../common/commands.js'

// Simple math quiz - returns a question and stores the answer
// Since we can't listen to chat events in the same way as the source,
// this simplified version just presents a question
export default class QuickMaths extends ChatCommandHandler {
  constructor() {
    super({
      triggers: ['quickmaths', 'qm', 'math'],
      description: 'Presents a quick math problem to solve',
      example: `qm`
    })
  }

  handler(context: ChatCommandContext): string {
    const operands = [Math.floor(Math.random() * 10), Math.floor(Math.random() * 10)]
    const operators = ['+', '-', '*'] as const
    const operator = operators[Math.floor(Math.random() * operators.length)]

    const equation = `${operands[0]} ${operator} ${operands[1]}`

    let answer = 0
    switch (operator) {
      case '+': {
        answer = operands[0] + operands[1]
        break
      }
      case '-': {
        answer = operands[0] - operands[1]
        break
      }
      case '*': {
        answer = operands[0] * operands[1]
        break
      }
      default: {
        throw new Error(`Unsupported operator: ${operator}`)
      }
    }

    // Return both question and answer since we can't track responses
    return `${context.username}, what is ${equation}? (Answer: ${answer})`
  }
}

