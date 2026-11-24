import { loadDb } from './testdb'
import { describe, expect, it } from 'vitest'
import { buildGraph } from './core/graph'
import { IDENTITY, parsePt } from './core/geometry'
import { candidates, openPath, playFree, startStep, type Ctx, type Start } from './view'
import { decodeLine, decodeView, encodeLine, encodeView, linkFor, readUrl } from './share'

const files = loadDb((p) => p.startsWith('general/joseki/'))
const ctx: Ctx = { graph: buildGraph(files), active: new Set(['general']), order: ['general'], U: IDENTITY }

describe('shareable links', () => {
  it('a line from the empty corner survives encoding and decoding', () => {
    const start: Start = { kind: 'empty' }
    let p = [startStep(ctx, start)]
    for (const [s, pt] of [[1, 'Q16'], [-1, 'R17'], [1, 'Q17'], [-1, 'R16']] as const) p = [...p, playFree(ctx, p[p.length - 1], s, parsePt(pt)!)]
    const enc = encodeLine(ctx, p)
    expect(enc).toBe('pd.qc.pc.qd')
    const back = decodeLine(ctx, start, enc)
    expect(back.map((s) => s.key)).toEqual(p.map((s) => s.key))
  })

  it('a line from a label start, with a pass and an out-of-turn move', () => {
    const start: Start = { kind: 'label', id: '3-4-low-approach' }
    let p = [startStep(ctx, start)]
    p = [...p, candidates(ctx, p[0])[0].step]
    p = [...p, playFree(ctx, p[1], -1, null)] // White passes
    p = [...p, playFree(ctx, p[2], -1, parsePt('C3')!)] // White again
    const enc = encodeLine(ctx, p)
    expect(enc.split('.')[1]).toBe('-')
    expect(enc.split('.')[2]).toMatch(/^W/)
    expect(decodeLine(ctx, start, enc).map((s) => s.key)).toEqual(p.map((s) => s.key))
  })

  it('stops at a move that cannot be played', () => {
    const line = decodeLine(ctx, { kind: 'empty' }, 'pd.pd.qc')
    expect(line.length).toBe(2)
  })

  it('reads the address and the view', () => {
    expect(readUrl('?open=3-3-point&line=pd&view=br-m')).toEqual({ start: { kind: 'label', id: '3-3-point' }, line: 'pd', view: { corner: 'br', mirror: true, swap: false } })
    expect(readUrl('')).toBeNull()
    expect(encodeView({ corner: 'tr', mirror: false, swap: false })).toBe('')
    expect(decodeView('tl-s')).toEqual({ corner: 'tl', mirror: false, swap: true })
  })
})

describe('opening a sequence directly', () => {
  const start: Start = { kind: 'label', id: 'joseki/4-4 point/3-3 invasion' }
  it('its line starts at the empty corner, through the main moves before it', () => {
    const p = openPath(ctx, start)
    expect(p.length).toBe(3) // empty corner, 4-4 stone, 3-3 invasion
    expect(ctx.graph.nodes.get(p[0].key)!.board.flat().every((x) => x === 0)).toBe(true)
    expect(p[2].key).toBe(ctx.graph.entries.get(start.id)!.root)
    expect(startStep(ctx, start).key).toBe(p[0].key)
  })
  it('a link names the sequence and only the moves after its first position', () => {
    ;(globalThis as { location?: unknown }).location ??= { origin: 'https://example.org', pathname: '/' }
    const p = openPath(ctx, start)
    const q = [...p, candidates(ctx, p[2])[0].step]
    const url = new URL(linkFor(ctx, start, q, { corner: 'tr', mirror: false, swap: false })!)
    expect(url.searchParams.get('open')).toBe(start.id)
    expect(url.searchParams.get('line')!.split('.').length).toBe(1)
    expect(decodeLine(ctx, start, url.searchParams.get('line')!).map((x) => x.key)).toEqual(q.map((x) => x.key))
  })
})

