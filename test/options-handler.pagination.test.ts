import type { CategoryOption } from '../src/instance/discord/utility/options-handler.js'
import {
  DEFAULT_PAGE_SIZE,
  MAX_COMPONENTS,
  OptionType,
  ViewBuilder
} from '../src/instance/discord/utility/options-handler.js'

// Build a big category with many label options
const many = 50
const options: any[] = []
for (let index = 0; index < many; index++) {
  options.push({ type: OptionType.Label, name: `Item ${index}`, getOption: undefined })
}

const bigCategory = { type: OptionType.Category, name: 'Big Category', options } as unknown as CategoryOption

const ids = new Map()
const view = new ViewBuilder(bigCategory, ids, [], true, 0, DEFAULT_PAGE_SIZE).create()

if (view.components.length > MAX_COMPONENTS)
  throw new Error(`components exceed MAX_COMPONENTS (${view.components.length} > ${MAX_COMPONENTS})`)

// Ensure that when many options exist, paging controls are present
const hasNext = view.components.some((c: any) => c?.components?.some((cc: any) => cc?.customId === 'options:page:next'))
if (!hasNext) throw new Error('expected a Next page button for large category')

console.log('PASS: options-handler pagination basic tests')
