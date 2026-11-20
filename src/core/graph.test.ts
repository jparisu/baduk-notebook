import { describe, expect, it } from 'vitest'
import { buildGraph, labelsAt, visibleEdges } from './graph'
import { parsePt } from './geometry'
import { candidates, playFree, primaryLabel, startStep } from '../view'
import { ctxOf, loadDb } from '../testdb'

const files = loadDb()
const ctx = ctxOf(files)
const g = ctx.graph

describe('position graph', () => {
  it('loads every database without problems', () => {
    expect(g.problems).toEqual([])
  })

  it('sequences start at the position whose id has no ":N"', () => {
    expect(g.entries.get('joseki')!.root).toBe(startStep(ctx, { kind: 'empty' }).key)
    expect(g.entries.get('joseki/4-4 point/3-3 invasion')!.type).toBe('joseki')
    expect([...g.entries.keys()].some((k) => k.startsWith('life & death/'))).toBe(true)
  })

  it('N counts moves from the empty corner', () => {
    const empty = startStep(ctx, { kind: 'empty' })
    expect(g.depth.get(empty.key)).toBe(0)
    const s = playFree(ctx, empty, 1, parsePt('Q16')!)
    expect(g.depth.get(s.key)).toBe(1)
  })

  it('the same position in two databases is one node with both contributions', () => {
    const shared = [...g.nodes.values()].find((n) => n.contribs.some((c) => c.db === 'jparisu') && n.contribs.some((c) => c.db === 'general'))
    expect(shared).toBeDefined()
    expect(visibleEdges(g, shared!.key, new Set(['general'])).length).toBeLessThanOrEqual(shared!.edges.length)
  })

  it('Black to play and White to play are different positions', () => {
    const a = startStep(ctx, { kind: 'setup', B: [parsePt('Q16')!], W: [], toMove: -1 })
    const b = startStep(ctx, { kind: 'setup', B: [parsePt('Q16')!], W: [], toMove: 1 })
    expect(a.key).not.toBe(b.key)
    // Colors are not swapped either: a white 4-4 stone is not the black one.
    const w = startStep(ctx, { kind: 'setup', B: [], W: [parsePt('Q16')!], toMove: 1 })
    expect(w.key).not.toBe(a.key)
  })

  it('first moves from the empty corner lead into their sequences', () => {
    const empty = startStep(ctx, { kind: 'empty' })
    for (const [pt, seq] of [['Q16', 'joseki/4-4 point'], ['R16', 'joseki/3-4 point'], ['R17', 'joseki/3-3 point']] as const) {
      const s = playFree(ctx, empty, 1, parsePt(pt)!)
      expect(primaryLabel(ctx, [empty, s])).toBe(seq)
      expect(labelsAt(g, s.key, ctx.active)).toContain(seq)
      for (const c of candidates(ctx, s).filter((c) => c.pt)) expect(primaryLabel(ctx, [empty, s, c.step])?.startsWith(seq + '/')).toBe(true)
    }
  })

  it('reports a move that does not lead to the id it names', () => {
    const bad = buildGraph([{ db: 'x', path: 'x/a.json', positions: [
      { id: 'a', stones: '', toPlay: 'B', free: 'corner', data: {}, moves: [{ move: 'pd', to: 'a:1', data: {} }] },
      { id: 'a:1', stones: 'B:qc', toPlay: 'W', free: 'corner', data: {}, moves: [] },
    ] }])
    expect(bad.problems.map((p) => p.message)).toEqual(['Move pd does not lead to "a:1"'])
  })
})
