import { describe, expect, it } from 'vitest'
import { erase, record, type Line } from './session'

const m = (x: number) => ({ sign: 1 as const, pt: [x, 0] as [number, number] })
const start = { kind: 'empty' as const }

describe('session lines', () => {
  it('keeps the longest line and separate variations', () => {
    let l: Line[] = []
    l = record(l, { start, moves: [m(1)] })
    l = record(l, { start, moves: [m(1), m(2)] })
    expect(l.length).toBe(1)
    l = record(l, { start, moves: [m(1)] })
    expect(l.length).toBe(1)
    l = record(l, { start, moves: [m(1), m(3)] })
    expect(l.length).toBe(2)
  })

  it('erases a variation and everything after it', () => {
    let l: Line[] = [{ start, moves: [m(1), m(2), m(4)] }, { start, moves: [m(1), m(3)] }]
    l = erase(l, start, [m(1), m(2)])
    expect(l).toEqual([{ start, moves: [m(1), m(3)] }])
  })
})

import { movesOf } from './view'
describe('stored moves', () => {
  it('keep only color and point', () => {
    const steps = [{ key: 'a', D: { a: 1, b: 0, c: 0, d: 1, swap: false } }, { key: 'b', D: { a: 1, b: 0, c: 0, d: 1, swap: false }, edge: { child: 'b', sign: 1, pt: [3, 3], rel: { a: 1, b: 0, c: 0, d: 1, swap: false }, contribs: [{ db: 'x' }] } }] as never
    expect(movesOf(steps)).toEqual([{ sign: 1, pt: [3, 3] }])
  })
})
