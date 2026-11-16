/**
 * Find position (SPEC §7): exact, contained and near matches for each corner (joseki)
 * and for shapes anywhere on the board (with translation, SPEC §6.3).
 */
import { SIZE, SYMMETRIES, compose, cornerWindow, inverse, transformMap, userTransform, withSwap, type Corner, type DisplayOptions, type Sign, type SignMap, type Transform } from './geometry'
import type { Graph } from './graph'

export type MatchKind = 'exact' | 'contained' | 'near'

export interface Match {
  kind: MatchKind
  entryId: string
  keys: string[] // line from the entry root to the matched position
  where: string // "top-right corner" / "shape area around Q16"
  /** user frame → canonical frame of the matched position */
  toCanon: Transform
  missing: number
  extra: number
  stones: number
  translated?: [number, number]
}

const CORNERS: [Corner, string][] = [['tl', 'top-left'], ['tr', 'top-right'], ['bl', 'bottom-left'], ['br', 'bottom-right']]
const ALL: Transform[] = SYMMETRIES.flatMap((s) => [s, withSwap(s, true)])

function cropCorner(map: SignMap, c: Corner): SignMap {
  const [x0, x1, y0, y1] = cornerWindow(c)
  return map.map((row, y) => row.map((s, x) => (x >= x0 && x <= x1 && y >= y0 && y <= y1 ? s : 0))) as SignMap
}

function stonesOf(map: SignMap): [number, number, Sign][] {
  const out: [number, number, Sign][] = []
  map.forEach((row, y) => row.forEach((s, x) => s && out.push([x, y, s])))
  return out
}

/** For every position: one line (keys from the entry root) per entry that reaches it. */
export function indexLines(g: Graph, active: Set<string>): Map<string, { entryId: string; keys: string[] }[]> {
  const out = new Map<string, { entryId: string; keys: string[] }[]>()
  for (const e of g.entries.values()) {
    if (!e.contribs.some((c) => active.has(c.db))) continue
    const seen = new Set<string>()
    const queue: string[][] = [[e.root]]
    while (queue.length) {
      const keys = queue.shift()!
      const k = keys[keys.length - 1]
      if (seen.has(k)) continue
      seen.add(k)
      out.set(k, [...(out.get(k) ?? []), { entryId: e.id, keys }])
      for (const ed of g.nodes.get(k)?.edges ?? []) if (ed.contribs.some((c) => active.has(c.db))) queue.push([...keys, ed.child])
    }
  }
  return out
}

function compare(node: SignMap, user: SignMap, region?: [number, number, number, number]) {
  let missing = 0, extra = 0, stones = 0
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const a = node[y][x], b = user[y][x]
      if (a) stones++
      if (a && a !== b) missing++
      if (b && b !== a && (!region || (x >= region[0] && x <= region[1] && y >= region[2] && y <= region[3]))) extra++
    }
  return { missing, extra, stones }
}

export function search(g: Graph, active: Set<string>, user: SignMap, maxNear = 2): Match[] {
  const lines = indexLines(g, active)
  const best = new Map<string, Match>() // one result per entry+position
  const keep = (m: Match) => {
    const id = m.entryId + '|' + m.keys[m.keys.length - 1]
    const cur = best.get(id)
    const score = (x: Match) => (x.kind === 'exact' ? 0 : x.kind === 'contained' ? 1 : 2) * 100 + x.missing + x.extra
    if (!cur || score(m) < score(cur)) best.set(id, m)
  }

  // Joseki: each corner, every orientation.
  for (const [corner, label] of CORNERS) {
    const crop = cropCorner(user, corner)
    if (!stonesOf(crop).length) continue
    for (const t of ALL) {
      const u = transformMap(t, crop)
      for (const [key, owners] of lines) {
        const node = g.nodes.get(key)!
        for (const o of owners) {
          if (g.entries.get(o.entryId)!.type !== 'joseki') continue
          const { missing, extra, stones } = compare(node.board, u)
          if (!stones) continue
          const kind: MatchKind | null = !missing && !extra ? 'exact' : !missing ? 'contained' : missing + extra <= maxNear && stones >= 3 ? 'near' : null
          if (kind) keep({ kind, entryId: o.entryId, keys: o.keys, where: `${label} corner`, toCanon: t, missing, extra, stones })
        }
      }
    }
  }

  // Shapes: anywhere, with translation that keeps the same edges.
  const userStones = stonesOf(user)
  if (userStones.length)
    for (const [key, owners] of lines)
      for (const o of owners) {
        if (g.entries.get(o.entryId)!.type !== 'shape') continue
        const node = g.nodes.get(key)!
        const st = stonesOf(node.board)
        if (!st.length) continue
        const xs = st.map((s) => s[0]), ys = st.map((s) => s[1])
        const [minx, maxx, miny, maxy] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
        const range = (lo: number, hi: number) => (lo === 0 || hi === SIZE - 1 ? [0] : Array.from({ length: SIZE - 2 - (hi - lo) }, (_, i) => i + 1 - lo))
        for (const t of ALL) {
          const u = transformMap(t, user)
          for (const dx of range(minx, maxx))
            for (const dy of range(miny, maxy)) {
              // Shift the shape instead of the board: compare node stones moved by (dx, dy).
              let missing = 0, extra = 0
              for (const [x, y, s] of st) if (u[y + dy]?.[x + dx] !== s) missing++
              if (missing > maxNear) continue
              for (let y = miny + dy; y <= maxy + dy; y++)
                for (let x = minx + dx; x <= maxx + dx; x++) {
                  const b = u[y][x]
                  if (b && node.board[y - dy][x - dx] !== b) extra++
                }
              const kind: MatchKind | null = !missing && !extra ? 'exact' : missing + extra <= maxNear && st.length >= 3 ? 'near' : null
              if (kind) keep({ kind, entryId: o.entryId, keys: o.keys, where: 'shape', toCanon: t, missing, extra, stones: st.length, translated: [dx, dy] })
            }
        }
      }

  const order = { exact: 0, contained: 1, near: 2 }
  return [...best.values()].sort((a, b) => order[a.kind] - order[b.kind] || b.stones - a.stones || a.missing + a.extra - (b.missing + b.extra)).slice(0, 30)
}

/** The display options (corner, mirror, colors) that show a position the way the user sees it. */
export function displayFor(target: Transform): DisplayOptions {
  for (const corner of ['tr', 'tl', 'br', 'bl'] as Corner[])
    for (const mirror of [false, true])
      for (const swap of [false, true]) {
        const t = userTransform({ corner, mirror, swap })
        if (t.a === target.a && t.b === target.b && t.c === target.c && t.d === target.d && t.swap === target.swap) return { corner, mirror, swap }
      }
  return { corner: 'tr', mirror: false, swap: false }
}

/** U such that U ∘ D shows the canonical position in the user's frame: U = inverse(toCanon) ∘ inverse(D). */
export const userViewFor = (toCanon: Transform, D: Transform) => displayFor(compose(inverse(toCanon), inverse(D)))
