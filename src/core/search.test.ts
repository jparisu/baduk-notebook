import { describe, expect, it } from 'vitest'
import { parsePt, apply, compose, userTransform, type SignMap } from './geometry'
import { search, userViewFor } from './search'
import { rootStep, type Ctx } from '../view'
import { ctxOf, loadDb } from '../testdb'

const base = ctxOf(loadDb((p) => p.startsWith('general/')), ['general'])
const g = base.graph
const active = base.active
const empty = (): SignMap => Array.from({ length: 19 }, () => Array(19).fill(0))
const put = (m: SignMap, s: 1 | -1, ...pts: string[]) => pts.forEach((p) => { const [x, y] = parsePt(p)!; m[y][x] = s })
const INV = 'joseki/4-4 point/3-3 invasion'

describe('find position', () => {
  it('finds a joseki position in another corner, ignoring a distant stone', () => {
    const m = empty()
    // B Q16, W R17 (the 3-3 invasion) rotated to the bottom-left: D4, C3.
    put(m, 1, 'D4')
    put(m, -1, 'C3')
    put(m, 1, 'Q10') // outside the bottom-left corner
    const res = search(g, active, m)
    expect(res.find((r) => r.kind === 'exact')?.entryId).toBe(INV)
    expect(res.every((r) => r.where !== 'top-right corner')).toBe(true)
  })

  it('does not match the same stones with colors swapped', () => {
    const m = empty()
    put(m, -1, 'D4')
    put(m, 1, 'C3')
    expect(search(g, active, m).some((r) => r.kind === 'exact' && r.entryId === INV)).toBe(false)
  })

  it('returns the display options that show the match like the input', () => {
    const ctx: Ctx = { ...base, U: userTransform({ corner: 'tr', mirror: false, swap: false }) }
    const p = rootStep(ctx, INV)
    const m = empty()
    put(m, 1, 'Q4')
    put(m, -1, 'R3')
    const exact = search(g, active, m).find((r) => r.kind === 'exact')!
    expect(exact.entryId).toBe(INV)
    const U = userTransform(userViewFor(exact.toCanon, p.D))
    expect(apply(compose(U, p.D), apply(exact.toCanon, parsePt('Q4')!))).toEqual(parsePt('Q4'))
  })

  it('finds a side shape moved along the edge it may slide on', () => {
    const shape = [...g.entries.values()].find((e) => e.id.startsWith('life & death/Straight three'))!
    const n = g.nodes.get(shape.root)!
    // Stored on the top edge; shift it 3 lines to the left.
    const stored = n.contribs[0].pos.stones
    const m = empty()
    for (const part of stored.split(' ')) {
      const [c, list] = part.split(':')
      for (const v of list.split(',')) m[v.charCodeAt(1) - 97][v.charCodeAt(0) - 97 - 3] = c === 'B' ? 1 : -1
    }
    expect(search(g, active, m).some((r) => r.entryId === shape.id && r.kind === 'exact')).toBe(true)
  })
})
