import { describe, expect, it } from 'vitest'
import './testdb' // the tag descriptions: evaluation and sente inherit and roll up, names do not
import { buildGraph } from './core/graph'
import { IDENTITY } from './core/geometry'
import type { PosRec } from './core/model'
import type { Tags } from './core/tags'
import { candidates, lineFields, rootStep, type Ctx, type Step } from './view'

const pos = (id: string, stones: string, toPlay: 'B' | 'W', tags: Tags, to: string[]): PosRec =>
  ({ id, stones, toPlay, free: 'corner', comments: [], tags, moves: to.map((t) => ({ to: t, move: '', comments: [], tags: {} })) })
const ctxOf = (positions: PosRec[]): Ctx => ({ graph: buildGraph([{ db: 'x', path: 'x/a.json', loose: [], positions }]), active: new Set(['x']), order: ['x'], U: IDENTITY })
const line = (ctx: Ctx, n: number) => {
  const out: Step[] = [rootStep(ctx, 'a')]
  for (let i = 0; i < n; i++) out.push(candidates(ctx, out[out.length - 1])[0].step)
  return out
}

describe('tags taken from earlier positions (inherit)', () => {
  const ctx = ctxOf([
    pos('a', 'B:pd', 'W', { evaluation: 0.5, sente: 'B', name: ['A'], 'my-note': 'free key' }, ['a:2']),
    pos('a:2', 'B:pd W:qc', 'B', {}, ['a/b']),
    pos('a/b', 'B:pc,pd W:qc', 'W', {}, []),
  ])
  it('a position without its own value shows the one of the closest earlier position, also past the start of a sequence', () => {
    const f = lineFields(ctx, line(ctx, 2)) // a/b starts another sequence
    expect(f.get('evaluation')?.value).toBe(0.5)
    expect(f.source('evaluation')).toBe(0)
    expect(f.get('sente')?.value).toBe('B')
    expect(f.get('name')).toBeNull() // names are not inherited
    expect(f.get('my-note')).toBeNull() // keys without a description are not inherited
  })
})

describe('tags worked out from the moves after a position (rollup)', () => {
  // a (Black to play) has two moves; after them, the evaluation is +0.3 or -0.5.
  const ctx = ctxOf([
    pos('a', 'B:pd W:qc', 'B', {}, ['a:3', 'a:3b']),
    pos('a:3', 'B:pc,pd W:qc', 'W', { evaluation: 0.3 }, []),
    pos('a:3b', 'B:pd,qe W:qc', 'W', { evaluation: -0.5, sente: 'W' }, []),
  ])
  it('a balance is the best for the player to move, from the leaves up', () => {
    const f = lineFields(ctx, line(ctx, 0))
    expect(f.get('evaluation')?.value).toBe(0.3) // Black takes the highest
    expect(f.source('evaluation')).toBe(0)
    const w = ctxOf([
      pos('a', 'B:pd W:qc', 'W', {}, ['a:3', 'a:3b']),
      pos('a:3', 'B:pd W:qc,pc', 'B', { evaluation: 0.3 }, []),
      pos('a:3b', 'B:pd W:qc,qe', 'B', { evaluation: -0.5 }, []),
    ])
    expect(lineFields(w, line(w, 0)).get('evaluation')?.value).toBe(-0.5) // White takes the lowest
  })
  it('sente is the one the main move leads to; an own value always wins', () => {
    expect(lineFields(ctx, line(ctx, 0)).get('sente')).toBeNull() // the main move (the first) leads to no sente
    const own = ctxOf([
      pos('a', 'B:pd W:qc', 'B', { evaluation: 0 }, ['a:3']),
      pos('a:3', 'B:pc,pd W:qc', 'W', { evaluation: 0.3 }, []),
    ])
    expect(lineFields(own, line(own, 0)).get('evaluation')?.value).toBe(0)
  })
})
