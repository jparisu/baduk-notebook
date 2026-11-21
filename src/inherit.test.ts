import { describe, expect, it } from 'vitest'
import './testdb' // the tag descriptions: evaluation is inherited, names are not
import { buildGraph } from './core/graph'
import { IDENTITY } from './core/geometry'
import type { PosRec } from './core/model'
import type { Tags } from './core/tags'
import { candidates, lineFields, startStep, type Ctx } from './view'

const pos = (id: string, stones: string, toPlay: 'B' | 'W', tags: Tags, to: string[]): PosRec =>
  ({ id, stones, toPlay, free: 'corner', comments: [], tags, moves: to.map((t) => ({ to: t, move: '', comments: [], tags: {} })) })

describe('inherited position tags', () => {
  const g = buildGraph([{ db: 'x', path: 'x/a.json', loose: [], positions: [
    pos('a', 'B:pd', 'W', { evaluation: 0.5, name: ['A'], 'my-note': 'free key' }, ['a:2']),
    pos('a:2', 'B:pd W:qc', 'B', {}, ['a:3']),
    pos('a:3', 'B:pc,pd W:qc', 'W', { evaluation: -1 }, ['a/b']),
    pos('a/b', 'B:pc,pd W:qc,qd', 'B', {}, []),
  ] }])
  const ctx: Ctx = { graph: g, active: new Set(['x']), order: ['x'], U: IDENTITY }
  const line = [startStep(ctx, { kind: 'label', id: 'a' })]
  for (let i = 0; i < 3; i++) line.push(candidates(ctx, line[line.length - 1])[0].step)

  it('a position without its own value shows the one of the closest earlier position', () => {
    const f = lineFields(ctx, line.slice(0, 2))
    expect(f.get('evaluation')?.value).toBe(0.5)
    expect(f.source('evaluation')).toBe(0)
    expect(f.get('name')).toBeNull() // names are not inherited
    expect(f.get('my-note')).toBeNull() // keys without a description are not inherited
    expect(f.keys()).toEqual(['evaluation'])
  })
  it('its own value wins, and is inherited from there on', () => {
    expect(lineFields(ctx, line.slice(0, 3)).get('evaluation')?.value).toBe(-1)
  })
  it('inheritance stops at the start of another sequence', () => {
    expect(lineFields(ctx, line).get('evaluation')).toBeNull()
  })
  it('any key can be read, described or not', () => {
    const f = lineFields(ctx, line.slice(0, 1))
    expect(f.keys()).toEqual(['name', 'evaluation', 'my-note'])
    expect(f.text('my-note')).toBe('free key')
  })
})
