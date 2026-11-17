import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildGraph } from './core/graph'
import { IDENTITY, parsePt } from './core/geometry'
import { candidates, inBook, playFree, rebaseLine, rootStep, type Ctx } from './view'
import { createWorkspace } from './edit/workspace'
import { locate } from './edit/ops'

const read = (p: string) => ({ db: p.split('/')[0], path: p, text: readFileSync(`db/${p}`, 'utf8') })
const DBS = [{ id: 'general', name: 'General', description: '', color: '#000', activeByDefault: true }]

function setup() {
  const ws = createWorkspace(DBS, [read('general/joseki/4-4-3-3-invasion.sgf')])
  const ctx = (): Ctx => ({ graph: buildGraph(ws.files), active: new Set(['general']), order: ['general'], U: IDENTITY })
  return { ws, ctx }
}

describe('free play', () => {
  it('leaves the book, keeps playing, and comes back when a database move is played', () => {
    const { ctx: mk } = setup()
    const ctx = mk()
    const root = rootStep(ctx, '4-4-3-3-invasion')
    const a = playFree(ctx, root, -1, parsePt('C3')!) // White elsewhere: not in the database
    expect(inBook(ctx, a)).toBe(false)
    expect(candidates(ctx, a)).toEqual([])
    const b = playFree(ctx, a, 1, parsePt('D4')!)
    expect(inBook(ctx, b)).toBe(false)
    // A database move from the start is recognized as such.
    const known = playFree(ctx, root, -1, parsePt('R17')!)
    expect(known.edge).toBeDefined()
  })

  it('recognizes a known position reached in a different order (transposition)', () => {
    const { ctx: mk } = setup()
    const ctx = mk()
    const root = rootStep(ctx, '4-4-3-3-invasion')
    // Book: W R17, B Q17, W R16. Play W R16 first, B Q17, then W R17 — wrong colors order, so use tenuki to fix turns.
    const s1 = playFree(ctx, root, -1, parsePt('R16')!)
    const s2 = playFree(ctx, s1, 1, parsePt('Q17')!)
    const s3 = playFree(ctx, s2, -1, parsePt('R17')!)
    expect(inBook(ctx, s3)).toBe(true)
    expect(candidates(ctx, s3)[0].pt).toEqual(parsePt('R15'))
  })

  it('saves a freely played line into a database and keeps it after rebuilding', () => {
    const { ws, ctx: mk } = setup()
    const ctx = mk()
    const root = rootStep(ctx, '4-4-3-3-invasion')
    const s1 = playFree(ctx, root, -1, parsePt('R14')!)
    const s2 = playFree(ctx, s1, 1, parsePt('O17')!)
    locate(ws, ctx, [root, s1, s2], 'general', '4-4-3-3-invasion', true)
    const ctx2 = mk()
    const line = rebaseLine(ctx2, '4-4-3-3-invasion', [root, s1, s2])
    expect(line.length).toBe(3)
    expect(line[2].edge).toBeDefined()
    expect(inBook(ctx2, line[2])).toBe(true)
  })
})
