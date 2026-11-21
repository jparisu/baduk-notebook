import { describe, expect, it } from 'vitest'
import './testdb' // the tag descriptions (move kinds)
import { buildGraph } from './core/graph'
import { IDENTITY } from './core/geometry'
import type { DbFile, PosRec } from './core/model'
import type { Tags } from './core/tags'
import { mainLine, mainMove, startStep, type Ctx } from './view'

const pos = (id: string, stones: string, toPlay: 'B' | 'W', tags: Tags, to: [string, string?][] = []): PosRec =>
  ({ id, stones, toPlay, free: 'corner', comments: [], tags, moves: to.map(([t, kind]) => ({ to: t, move: '', comments: [], tags: (kind ? { kind } : {}) as Tags })) })
const ctxOf = (files: DbFile[]): Ctx => ({ graph: buildGraph(files), active: new Set(['x', 'y']), order: ['x', 'y'], U: IDENTITY })

describe('main move', () => {
  const base = (startTags: Tags = {}) => [
    pos('a', 'B:pd', 'W', startTags, [['a:1', 'main'], ['a:1b', 'main']]),
    pos('a:1', 'B:pd W:qc', 'B', {}, [['a:2', 'main']]),
    pos('a:1b', 'B:pd W:qd', 'B', {}),
    pos('a:2', 'B:pc,pd W:qc', 'W', {}),
  ]
  it('is the first stored move, and the main line follows main moves', () => {
    const ctx = ctxOf([{ db: 'x', path: 'x/a.json', positions: base(), loose: [] }])
    const s = startStep(ctx, { kind: 'label', id: 'a' })
    expect(mainMove(ctx, s)?.pt).toEqual([16, 2]) // R17 (qc)
    expect(mainLine(ctx, [s]).length).toBe(2)
  })
  it('the position\'s main tag chooses another one', () => {
    const ctx = ctxOf([{ db: 'x', path: 'x/a.json', positions: base({ main: 'a:1b' }), loose: [] }])
    expect(ctx.graph.problems).toEqual([])
    expect(mainMove(ctx, startStep(ctx, { kind: 'label', id: 'a' }))?.pt).toEqual([16, 3]) // R16 (qd)
  })
  it('a main tag that names no move of the position is reported', () => {
    const ctx = ctxOf([{ db: 'x', path: 'x/a.json', positions: base({ main: 'a:2' }), loose: [] }])
    expect(ctx.graph.problems.map((p) => p.message)).toEqual(['main: "a:2" is not the id of a move from this position'])
  })
})
