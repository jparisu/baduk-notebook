import { describe, expect, it } from 'vitest'
import '../testdb'
import { validateAll } from './validate'
import type { DbFile } from './model'

const file = (comment: string): DbFile => ({
  db: 'x', path: 'x/a.json', loose: [],
  positions: [{ id: 'a', stones: 'B:pd', toPlay: 'W', free: 'corner', comments: [comment], tags: {}, moves: [] }],
})
const errors = (comment: string) => validateAll([file(comment)], new Set(['x'])).filter((i) => i.severity === 'error').map((i) => i.message)

describe('comments', () => {
  it('board references and player words are fine', () => {
    expect(errors('{{Black}} plays {{CR:R16|here}}; {{TR:Q16}} too.')).toEqual([])
  })
  it('braces that are not a reference are reported, since they would show as raw text', () => {
    expect(errors('Blocking from the side ({{R16}}) is the same.')).toEqual([
      '"{{R16}}" is not a board reference: write it as {{TYPE:points|words}}, e.g. {{CR:Q16|Q16}}',
    ])
  })
})
