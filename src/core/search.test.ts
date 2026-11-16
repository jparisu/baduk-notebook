import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as sgf from '@sabaki/sgf'
import { buildGraph } from './graph'
import { parsePt, apply, compose, userTransform, type SignMap } from './geometry'
import { search, userViewFor } from './search'
import { rootStep, candidates, type Ctx } from '../view'

const load = (p: string) => ({ db: p.split('/')[0], path: p, roots: sgf.parse(readFileSync(`db/${p}`, 'utf8')) })
const g = buildGraph([load('general/joseki/4-4-3-3-invasion.sgf'), load('general/shapes/straight-three-side.sgf')])
const active = new Set(['general'])
const empty = (): SignMap => Array.from({ length: 19 }, () => Array(19).fill(0))
const put = (m: SignMap, s: 1 | -1, ...pts: string[]) => pts.forEach((p) => { const [x, y] = parsePt(p)!; m[y][x] = s })

describe('find position', () => {
  it('finds a joseki position in another corner with swapped colors, plus a distant stone', () => {
    const m = empty()
    // 3-3 invasion after 4 moves, rotated to the bottom-left with colors swapped.
    put(m, -1, 'D4', 'D3', 'E2')
    put(m, 1, 'C3', 'C4')
    put(m, 1, 'K10') // far away: ignored
    // Original: B Q16, W R17, B Q17, W R16, B R15 → 180° rotation: D4, C3, D3, C4, C5... adjust to a contained case
    const res = search(g, active, m)
    expect(res.length).toBeGreaterThan(0)
    expect(res.every((r) => r.where === 'bottom-left corner' || r.where === 'shape')).toBe(true)
  })

  it('returns an exact match and the display options that show it like the input', () => {
    const ctx: Ctx = { graph: g, active, order: ['general'], U: userTransform({ corner: 'tr', mirror: false, swap: false }) }
    let p = [rootStep(ctx, '4-4-3-3-invasion')]
    for (let i = 0; i < 2; i++) p = [...p, candidates(ctx, p[p.length - 1])[0].step]
    // Same position (B Q16, W R17, B Q17) placed in the bottom-right corner.
    const m = empty()
    put(m, 1, 'Q4', 'Q3')
    put(m, -1, 'R3')
    const res = search(g, active, m)
    const exact = res.find((r) => r.kind === 'exact')!
    expect(exact.entryId).toBe('4-4-3-3-invasion')
    expect(exact.keys.length).toBe(3)
    const view = userViewFor(exact.toCanon, p[2].D)
    // Showing the stored line with that view puts the stones where the user placed them.
    const U = userTransform(view)
    const shown = apply(compose(U, p[2].D), apply(exact.toCanon, parsePt('Q4')!))
    expect(shown).toEqual(parsePt('Q4'))
  })

  it('finds a shape moved along the side', () => {
    const m = empty()
    // Straight three on the right side, shifted 5 lines down (eye space T9–T11).
    put(m, 1, 'T8', 'T12', 'S8', 'S9', 'S10', 'S11', 'S12')
    put(m, -1, 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'S7', 'T7', 'S13', 'T13')
    const res = search(g, active, m)
    expect(res.some((r) => r.entryId === 'straight-three-side' && r.kind === 'exact')).toBe(true)
  })
})
