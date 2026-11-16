/** Board geometry: points, the 8 board symmetries and color swap (SPEC §6, §8.4). */

export type Pt = [number, number] // [x, y], 0-based, y = 0 is the top row (SGF convention)
export type Sign = -1 | 0 | 1
export type SignMap = Sign[][]

export const SIZE = 19
const C = (SIZE - 1) / 2

/** A symmetry of the board plus an optional color swap. Acts on centered coordinates: [u', v'] = [a·u + b·v, c·u + d·v]. */
export interface Transform {
  a: number
  b: number
  c: number
  d: number
  swap: boolean
}

export const IDENTITY: Transform = { a: 1, b: 0, c: 0, d: 1, swap: false }

/** The 8 symmetries of the square, without color swap. */
export const SYMMETRIES: Transform[] = [
  [1, 0, 0, 1], [-1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, -1],
  [0, 1, 1, 0], [0, -1, 1, 0], [0, 1, -1, 0], [0, -1, -1, 0],
].map(([a, b, c, d]) => ({ a, b, c, d, swap: false }))

export function apply(t: Transform, [x, y]: Pt): Pt {
  const u = x - C, v = y - C
  return [t.a * u + t.b * v + C, t.c * u + t.d * v + C]
}

export const applySign = (t: Transform, s: Sign): Sign => (t.swap ? (-s as Sign) : s)

/** compose(t2, t1) = apply t1 first, then t2. */
export function compose(t2: Transform, t1: Transform): Transform {
  return {
    a: t2.a * t1.a + t2.b * t1.c + 0, // "+ 0" turns -0 into 0
    b: t2.a * t1.b + t2.b * t1.d + 0,
    c: t2.c * t1.a + t2.d * t1.c + 0,
    d: t2.c * t1.b + t2.d * t1.d + 0,
    swap: t2.swap !== t1.swap,
  }
}

/** Symmetry matrices are orthogonal, so the inverse is the transpose. */
export const inverse = (t: Transform): Transform => ({ a: t.a, b: t.c, c: t.b, d: t.d, swap: t.swap })

export const withSwap = (t: Transform, swap: boolean): Transform => ({ ...t, swap })

export function transformMap(t: Transform, map: SignMap): SignMap {
  const out: SignMap = Array.from({ length: SIZE }, () => Array<Sign>(SIZE).fill(0))
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const s = map[y][x]
      if (s) {
        const [x2, y2] = apply(t, [x, y])
        out[y2][x2] = applySign(t, s)
      }
    }
  return out
}

/* ---- Display transform chosen by the user (SPEC §8.4) ---- */

export type Corner = 'tl' | 'tr' | 'bl' | 'br'

const CORNER: Record<Corner, Transform> = {
  tr: IDENTITY,
  tl: { a: -1, b: 0, c: 0, d: 1, swap: false },
  br: { a: 1, b: 0, c: 0, d: -1, swap: false },
  bl: { a: -1, b: 0, c: 0, d: -1, swap: false },
}
/** Reflection across the top-right corner's diagonal: the two sides of the corner trade places. */
const MIRROR: Transform = { a: 0, b: -1, c: -1, d: 0, swap: false }

export interface DisplayOptions {
  corner: Corner
  mirror: boolean
  swap: boolean
}

export function userTransform(o: DisplayOptions): Transform {
  const t = compose(CORNER[o.corner], o.mirror ? MIRROR : IDENTITY)
  return withSwap(t, o.swap)
}

/** Board window [x0, x1, y0, y1] of the 10×10 view for a corner. */
export function cornerWindow(c: Corner): [number, number, number, number] {
  const left = c === 'tl' || c === 'bl', top = c === 'tl' || c === 'tr'
  return [left ? 0 : 9, left ? 9 : 18, top ? 0 : 9, top ? 9 : 18]
}

/* ---- Coordinates ---- */

const COLS = 'ABCDEFGHJKLMNOPQRST'
export const colName = (x: number) => COLS[x]
export const ptName = ([x, y]: Pt) => `${COLS[x]}${SIZE - y}`

/** Parses a human coordinate such as "Q16". Returns null if invalid. */
export function parsePt(s: string): Pt | null {
  const m = s.trim().toUpperCase().match(/^([A-HJ-T])(\d{1,2})$/)
  if (!m) return null
  const x = COLS.indexOf(m[1]), y = SIZE - Number(m[2])
  return y >= 0 && y < SIZE ? [x, y] : null
}

/** Parses an SGF coordinate such as "pd". Empty string → null (pass). */
export function parseSgfPt(s: string): Pt | null {
  if (s.length !== 2) return null
  const x = s.charCodeAt(0) - 97, y = s.charCodeAt(1) - 97
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE ? [x, y] : null
}

/** Parses an SGF point list value: "pd" or a rectangle "pd:qe". */
export function parseSgfPtList(value: string): Pt[] {
  const [a, b] = value.split(':')
  const p = parseSgfPt(a)
  if (!p) return []
  const q = b ? parseSgfPt(b) : p
  if (!q) return [p]
  const out: Pt[] = []
  for (let x = Math.min(p[0], q[0]); x <= Math.max(p[0], q[0]); x++)
    for (let y = Math.min(p[1], q[1]); y <= Math.max(p[1], q[1]); y++) out.push([x, y])
  return out
}
