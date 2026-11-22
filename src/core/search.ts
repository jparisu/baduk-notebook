/**
 * Find position (docs/MODEL.md §5–6): exact, contained and near matches. Positions fixed in the corner
 * are compared corner by corner; the others slide along the directions their placement (`free`) allows.
 * Every orientation is tried, also with the colors swapped; such matches say so and come after the
 * same match with the colors as stored.
 */
import { SIZE, SYMMETRIES, compose, cornerWindow, inverse, transformMap, userTransform, type Corner, type DisplayOptions, type Sign, type SignMap, type Transform } from './geometry'
import { freeOf, labelsAt, type Graph } from './graph'
import { canonical } from './hash'

export type MatchKind = 'exact' | 'contained' | 'near'

export interface Match {
  kind: MatchKind
  entryId: string
  /** Every label of the matched position (an exact match can belong to several). */
  labels: string[]
  keys: string[] // line from the entry root to the matched position
  where: string // "top-right corner" / "shape area around Q16"
  /** user frame → canonical frame of the matched position */
  toCanon: Transform
  /** Found with Black and White swapped. */
  swapped: boolean
  missing: number
  extra: number
  stones: number
  translated?: [number, number]
}

const CORNERS: [Corner, string][] = [['tl', 'top-left'], ['tr', 'top-right'], ['bl', 'bottom-left'], ['br', 'bottom-right']]
/** The 8 orientations, then the same with the colors swapped. */
const ALL: Transform[] = [...SYMMETRIES, ...SYMMETRIES.map((t) => ({ ...t, swap: true }))]

function cropCorner(map: SignMap, c: Corner): SignMap {
  const [x0, x1, y0, y1] = cornerWindow(c)
  return map.map((row, y) => row.map((s, x) => (x >= x0 && x <= x1 && y >= y0 && y <= y1 ? s : 0))) as SignMap
}

function stonesOf(map: SignMap): [number, number, Sign][] {
  const out: [number, number, Sign][] = []
  map.forEach((row, y) => row.forEach((s, x) => s && out.push([x, y, s])))
  return out
}

/**
 * For every position: one line (keys from the entry root) per entry that reaches it without leaving the
 * entry. A position that no entry reaches that way (it sits after a named variation but kept the id of
 * the sequence before it) gets the line from the closest entry start.
 */
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
      for (const ed of g.nodes.get(k)?.edges ?? []) {
        if (!ed.contribs.some((c) => active.has(c.db))) continue
        // Stay inside this label: stop where the following positions carry only other labels.
        if (!labelsAt(g, ed.child, active).includes(e.id)) continue
        queue.push([...keys, ed.child])
      }
    }
  }
  // Positions not reached inside their entry: the closest entry start, crossing into other entries.
  const queue: { entryId: string; keys: string[] }[] = [...out.entries()].flatMap(([k, ls]) => ls.filter((l) => l.keys[l.keys.length - 1] === k))
  const reached = new Set(out.keys())
  for (let i = 0; i < queue.length; i++) {
    const { entryId, keys } = queue[i]
    for (const ed of g.nodes.get(keys[keys.length - 1])?.edges ?? []) {
      if (reached.has(ed.child) || !ed.contribs.some((c) => active.has(c.db))) continue
      reached.add(ed.child)
      const line = { entryId, keys: [...keys, ed.child] }
      out.set(ed.child, [line])
      queue.push(line)
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
    const score = (x: Match) => (x.kind === 'exact' ? 0 : x.kind === 'contained' ? 1 : 2) * 100 + x.missing + x.extra + (x.swapped ? 50 : 0)
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
          if (freeOf(node) !== 'corner') continue
          const { missing, extra, stones } = compare(node.board, u)
          if (!stones) continue
          const kind: MatchKind | null = !missing && !extra ? 'exact' : !missing ? 'contained' : missing + extra <= maxNear && stones >= 3 ? 'near' : null
          if (kind) keep({ kind, entryId: o.entryId, labels: [o.entryId], keys: o.keys, where: `${label} corner`, toCanon: t, swapped: t.swap, missing, extra, stones })
        }
      }
    }
  }

  // Shapes: anywhere, with translation that keeps the same edges.
  const userStones = stonesOf(user)
  if (userStones.length)
    for (const [key, owners] of lines)
      for (const o of owners) {
        const node = g.nodes.get(key)!
        const free = freeOf(node)
        if (free === 'corner') continue
        // The free direction is given in the stored frame; find it in the canonical frame.
        const T = node.contribs[0].toCanon
        const storedX = T.a !== 0 // the stored x axis stays the x axis
        const freeX = free === 'anywhere' || (free === 'horizontal' ? storedX : !storedX)
        const freeY = free === 'anywhere' || (free === 'horizontal' ? !storedX : storedX)
        const st = stonesOf(node.board)
        if (!st.length) continue
        const xs = st.map((s) => s[0]), ys = st.map((s) => s[1])
        const [minx, maxx, miny, maxy] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
        const range = (lo: number, hi: number, free: boolean) => (free ? Array.from({ length: SIZE - (hi - lo) }, (_, i) => i - lo) : [0])
        for (const t of ALL) {
          const u = transformMap(t, user)
          for (const dx of range(minx, maxx, freeX))
            for (const dy of range(miny, maxy, freeY)) {
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
              if (kind) keep({ kind, entryId: o.entryId, labels: [o.entryId], keys: o.keys, where: 'shape', toCanon: t, swapped: t.swap, missing, extra, stones: st.length, translated: [dx, dy] })
            }
        }
      }

  return sameStones(g, dedupe([...best.values()]))
}

/**
 * Find sees only stones, not who plays next: a position and the one after a tenuki have the same
 * stones. Keep one result per set of stones: the one with the shortest line (reached without the tenuki).
 */
function sameStones(g: Graph, list: Match[]): Match[] {
  const seen = new Map<string, Match>()
  const stonesKey = (m: Match) => canonical(g.nodes.get(m.keys[m.keys.length - 1])!.board, 0).key + '|' + m.kind
  for (const m of list) {
    const k = stonesKey(m)
    const cur = seen.get(k)
    if (!cur || m.keys.length < cur.keys.length) seen.set(k, m)
  }
  return list.filter((m) => seen.get(stonesKey(m)) === m)
}

/**
 * One result per position and per label (SPEC §7.2): exact matches of the same position are merged,
 * and a label with an exact match shows no other (earlier or later) positions of its tree.
 */
export function dedupe(all: Match[]): Match[] {
  const order = { exact: 0, contained: 1, near: 2 }
  const exact = new Map<string, Match>()
  for (const m of all.filter((m) => m.kind === 'exact')) {
    const key = m.keys[m.keys.length - 1]
    const cur = exact.get(key)
    if (!cur) exact.set(key, { ...m, labels: [...m.labels] })
    else {
      for (const l of m.labels) if (!cur.labels.includes(l)) cur.labels.push(l)
      // Keep the most specific label (the shortest line from its first node) as the main one.
      if (Number(m.swapped) < Number(cur.swapped) || (m.swapped === cur.swapped && m.keys.length < cur.keys.length)) Object.assign(cur, { entryId: m.entryId, keys: m.keys, toCanon: m.toCanon, swapped: m.swapped, where: m.where })
    }
  }
  const covered = new Set([...exact.values()].flatMap((m) => m.labels))
  const rest = new Map<string, Match>()
  for (const m of all.filter((m) => m.kind !== 'exact')) {
    if (covered.has(m.entryId) || exact.has(m.keys[m.keys.length - 1])) continue
    const cur = rest.get(m.entryId)
    const better = !cur || order[m.kind] < order[cur.kind] || (order[m.kind] === order[cur.kind] && (Number(m.swapped) < Number(cur.swapped) || (m.swapped === cur.swapped && (m.stones > cur.stones || (m.stones === cur.stones && m.missing + m.extra < cur.missing + cur.extra)))))
    if (better) rest.set(m.entryId, m)
  }
  return [...exact.values(), ...rest.values()]
    .sort((a, b) => order[a.kind] - order[b.kind] || Number(a.swapped) - Number(b.swapped) || b.stones - a.stones || a.missing + a.extra - (b.missing + b.extra))
    .slice(0, 30)
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
