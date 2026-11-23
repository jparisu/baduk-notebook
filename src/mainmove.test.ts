import { describe, expect, it } from 'vitest'
import './testdb' // the tag descriptions (move kinds)
import { buildGraph } from './core/graph'
import { IDENTITY } from './core/geometry'
import type { DbFile, PosRec } from './core/model'
import { candidates, mainLine, mainMove, startStep, type Ctx } from './view'
import { createWorkspace } from './edit/workspace'
import { orderMoves } from './edit/ops'
import { writeDbFile } from './core/model'

const pos = (id: string, stones: string, toPlay: 'B' | 'W', to: string[] = []): PosRec =>
  ({ id, stones, toPlay, free: 'corner', comments: [], tags: {}, moves: to.map((t) => ({ to: t, move: '', comments: [], tags: {} })) })
const file = (db: string, ...positions: PosRec[]): DbFile => ({ db, path: `${db}/a.json`, positions, loose: [] })
const ctxOf = (files: DbFile[]): Ctx => ({ graph: buildGraph(files), active: new Set(['x', 'y']), order: ['x', 'y'], U: IDENTITY })
const pts = (ctx: Ctx) => candidates(ctx, startStep(ctx, { kind: 'label', id: 'a' })).map((c) => c.pt)
const R17: [number, number] = [16, 2], R16: [number, number] = [16, 3]

describe('order of the next moves; the first is the main move', () => {
  const tree = (order: string[]) => [pos('a', 'B:pd', 'W', order), pos('a:1', 'B:pd W:qc', 'B', ['a:2']), pos('a:1b', 'B:pd W:qd', 'B'), pos('a:2', 'B:pc,pd W:qc', 'W')]
  it('the stored order is the order; the main line follows the first moves', () => {
    const ctx = ctxOf([file('x', ...tree(['a:1', 'a:1b']))])
    expect(pts(ctx)).toEqual([R17, R16])
    const s = startStep(ctx, { kind: 'label', id: 'a' })
    expect(mainMove(ctx, s)?.pt).toEqual(R17)
    expect(mainLine(ctx, [s]).length).toBe(2)
    expect(pts(ctxOf([file('x', ...tree(['a:1b', 'a:1']))]))).toEqual([R16, R17])
  })
  it('a later database decides only when it stores every move from the position', () => {
    const y1 = file('y', pos('a', 'B:pd', 'W', ['a:1b']), pos('a:1b', 'B:pd W:qd', 'B'))
    expect(pts(ctxOf([file('x', ...tree(['a:1', 'a:1b'])), y1]))).toEqual([R17, R16]) // one note on a move: no change
    const y2 = file('y', pos('a', 'B:pd', 'W', ['a:1b', 'a:1']), pos('a:1', 'B:pd W:qc', 'B'), pos('a:1b', 'B:pd W:qd', 'B'))
    expect(pts(ctxOf([file('x', ...tree(['a:1', 'a:1b'])), y2]))).toEqual([R16, R17])
  })
  it('reordering from another database copies the moves there and stores the order', () => {
    const ws = createWorkspace([{ id: 'x', name: 'x', description: '', color: '#000', activeByDefault: true }, { id: 'y', name: 'y', description: '', color: '#000', activeByDefault: true }],
      [{ db: 'x', path: 'x/a.json', text: writeDbFile(file('x', ...tree(['a:1', 'a:1b']))) }])
    const ctx = ctxOf(ws.files)
    const s = startStep(ctx, { kind: 'label', id: 'a' })
    const [first, second] = candidates(ctx, s).map((c) => c.step)
    orderMoves(ws, ctx, [s], 'y', 'a', [second, first])
    const after = ctxOf(ws.files)
    expect(after.graph.problems).toEqual([])
    expect(pts(after)).toEqual([R16, R17])
    expect(ws.files.filter((f) => f.db === 'y').flatMap((f) => f.positions.flatMap((p) => p.moves)).length).toBe(2)
  })
})
