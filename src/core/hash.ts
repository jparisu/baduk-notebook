/** Zobrist hashing and canonical position keys (SPEC §6.2). */
import { SIZE, SYMMETRIES, apply, withSwap, type Sign, type SignMap, type Transform } from './geometry'

// Deterministic 32-bit PRNG so keys are stable between builds and browsers.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (t ^ (t >>> 14)) >>> 0
  }
}
const rand = mulberry32(0x5eed1234)
// Two 32-bit halves per (point, color) → 64-bit keys.
const TABLE: [number, number][][] = Array.from({ length: SIZE * SIZE }, () => [
  [rand(), rand()],
  [rand(), rand()],
])
const TO_MOVE: [number, number][] = [[rand(), rand()], [rand(), rand()]]

function hashOf(map: SignMap, toMove: Sign, t: Transform): string {
  let hi = 0, lo = 0
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      let s = map[y][x]
      if (!s) continue
      if (t.swap) s = -s as Sign
      const [x2, y2] = apply(t, [x, y])
      const [h, l] = TABLE[y2 * SIZE + x2][s === 1 ? 0 : 1]
      hi ^= h
      lo ^= l
    }
  let m = toMove
  if (m && t.swap) m = -m as Sign
  if (m) {
    const [h, l] = TO_MOVE[m === 1 ? 0 : 1]
    hi ^= h
    lo ^= l
  }
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0')
}

/**
 * Canonical key of a position: the smallest hash over the 8 symmetries × color swap.
 * `toCanon` maps the given board's frame to the canonical frame.
 */
export function canonical(map: SignMap, toMove: Sign): { key: string; toCanon: Transform } {
  let best: { key: string; toCanon: Transform } | null = null
  for (const sym of SYMMETRIES)
    for (const swap of [false, true]) {
      const t = withSwap(sym, swap)
      const key = hashOf(map, toMove, t)
      if (!best || key < best.key) best = { key, toCanon: t }
    }
  return best!
}
