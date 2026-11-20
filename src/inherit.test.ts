import { describe, expect, it } from 'vitest'
import { buildGraph } from './core/graph'
import { IDENTITY } from './core/geometry'
import type { PosRec } from './core/model'
import { candidates, lineFields, startStep, type Ctx } from './view'

const pos = (id: string, stones: string, toPlay: 'B' | 'W', data: Record<string, string[]>, moves: [string, string][]): PosRec =>
  ({ id, stones, toPlay, free: 'corner', data, moves: moves.map(([move, to]) => ({ move, to, data: {} })) })

describe('inherited position fields', () => {
  const g = buildGraph([{ db: 'x', path: 'x/a.json', positions: [
    pos('a', 'B:pd', 'W', { XPW: ['Start text'], XPB: ['2'], XNAME: ['A'] }, [['qc', 'a:2']]),
    pos('a:2', 'B:pd W:qc', 'B', {}, [['pc', 'a:3']]),
    pos('a:3', 'B:pc,pd W:qc', 'W', { XPB: ['-1'] }, [['qd', 'a/b']]),
    pos('a/b', 'B:pc,pd W:qc,qd', 'B', {}, []),
  ] }])
  const ctx: Ctx = { graph: g, active: new Set(['x']), order: ['x'], U: IDENTITY }
  const line = [startStep(ctx, { kind: 'label', id: 'a' })]
  for (let i = 0; i < 3; i++) line.push(candidates(ctx, line[line.length - 1])[0].step)

  it('a position without its own value shows the one of the closest earlier position', () => {
    const f = lineFields(ctx, line.slice(0, 2))
    expect(f.one('XPW')?.value).toBe('Start text')
    expect(f.source('XPW')).toBe(0)
    expect(f.one('XNAME')).toBeNull() // names are not inherited
  })
  it('its own value wins, and is inherited from there on', () => {
    expect(lineFields(ctx, line.slice(0, 3)).one('XPB')?.value).toBe('-1')
  })
  it('inheritance stops at the start of another sequence', () => {
    expect(lineFields(ctx, line).one('XPW')).toBeNull()
  })
})
