import { describe, expect, it } from 'vitest'
import { IDENTITY, SYMMETRIES, apply, compose, cornerWindow, inverse, parsePt, ptName, userTransform } from './geometry'
import { canonical } from './hash'
import type { SignMap } from './geometry'

const empty = (): SignMap => Array.from({ length: 19 }, () => Array(19).fill(0))

describe('geometry', () => {
  it('parses and prints coordinates', () => {
    expect(parsePt('Q16')).toEqual([15, 3])
    expect(ptName([15, 3])).toBe('Q16')
    expect(parsePt('I5')).toBeNull()
  })
  it('composes and inverts symmetries', () => {
    for (const s of SYMMETRIES) {
      expect(compose(s, inverse(s))).toEqual({ ...IDENTITY })
      for (const t of SYMMETRIES) {
        const p: [number, number] = [15, 3]
        expect(apply(compose(t, s), p)).toEqual(apply(t, apply(s, p)))
      }
    }
  })
  it('moves the top-right corner to the chosen corner', () => {
    const p = parsePt('Q16')!
    expect(ptName(apply(userTransform({ corner: 'tl', mirror: false, swap: false }), p))).toBe('D16')
    expect(ptName(apply(userTransform({ corner: 'bl', mirror: false, swap: false }), p))).toBe('D4')
    // mirror swaps the two sides of the corner: R17 (3-3) stays, R14 ↔ O17
    expect(ptName(apply(userTransform({ corner: 'tr', mirror: true, swap: false }), parsePt('R14')!))).toBe('O17')
    expect(cornerWindow('br')).toEqual([9, 18, 9, 18])
  })
})

describe('canonical hash', () => {
  it('gives the same key for all orientations, but not for swapped colors', () => {
    const a = empty(), b = empty(), c = empty()
    a[3][15] = 1; a[2][16] = -1 // Q16 black, R17 white (top-right)
    b[15][3] = 1; b[16][2] = -1 // same shape in the bottom-left
    c[3][15] = -1; c[2][16] = 1 // colors swapped
    const ka = canonical(a, 1).key
    expect(canonical(b, 1).key).toBe(ka)
    expect(canonical(c, -1).key).not.toBe(ka) // colors are never swapped
    expect(canonical(a, -1).key).not.toBe(ka) // the player to move matters
  })
})

import { playerWords } from './refs'
describe('player words in texts', () => {
  it('follows the color swap and who made the move', () => {
    expect(playerWords('{{Player}} cuts; {{opponent}} must connect.', false, -1)).toBe('White cuts; black must connect.')
    expect(playerWords('{{Black}} lives.', true, null)).toBe('White lives.')
    expect(playerWords('{{Player}} wins', true, 1)).toBe('White wins')
  })
})

import { boardMarks, parseText, writeBoard } from './refs'
import { IDENTITY as ID } from './geometry'
describe('board marks', () => {
  it('the board tag uses the reference syntax, and writes back the same', () => {
    const entries = ['TR:Q16,R17', 'LB:Q16=A', 'AR:Q16-R14', 'EYE:S19']
    const marks = boardMarks(entries)
    expect(marks.find((m) => m.type === 'EYE')).toEqual({ type: 'EYE', pts: [[17, 0]] })
    expect(marks.find((m) => m.type === 'LB')).toEqual({ type: 'LB', pts: [[15, 3]], label: 'A' })
    expect(writeBoard(marks)).toEqual(['TR:Q16,R17', 'LB:Q16=A', 'AR:Q16-R14', 'EYE:S19'])
    expect(boardMarks(['nonsense', 'ZZ:Q16'])).toEqual([])
  })
  it('eyes are read from text references', () => {
    const seg = parseText('Two {{EYE:S19,T18|eyes}}.', ID, 'x')
    expect(seg.some((s) => 'ref' in s && s.ref.every((m) => m.type === 'EYE'))).toBe(true)
  })
})
