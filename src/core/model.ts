/**
 * Stored data model (docs/MODEL.md): two kinds of record. A **position** (node) has a unique id, its
 * stones and who plays; a **move** (edge) goes from one position id to another. Both carry a list of
 * comments and a free dictionary of tags. Database files are JSON: `{ "positions": [...], "moves": [...] }`.
 */
import GoBoard from '@sabaki/go-board'
import type { Tags } from './tags'
import { SIZE, SYMMETRIES, parseSgfPt, transformMap, type Pt, type Sign, type SignMap } from './geometry'

/**
 * Placement (docs/MODEL.md §5): fixed in the corner, sliding along the edge the stones sit on (`side`),
 * or anywhere. Older files said `horizontal` / `vertical`; both read as `side`.
 */
export type Free = 'corner' | 'side' | 'anywhere'
export const FREE_VALUES: Free[] = ['corner', 'side', 'anywhere']
export const FREE_LABELS: [Free, string][] = [['corner', 'Fixed in the corner'], ['side', 'Slides along its edge'], ['anywhere', 'Anywhere']]

/** What positions and moves have in common: comments and tags. */
export interface Rec {
  comments: string[]
  tags: Tags
}

export interface MoveRec extends Rec {
  /** Id of the position it leads to (same database). */
  to: string
  /**
   * The point played, as an SGF point in the source position's stored frame, or "tenuki". Not stored:
   * worked out from the two positions when the graph is built ("" until then, or when they do not fit).
   */
  move: string
}

export interface PosRec extends Rec {
  id: string
  /** "B:pd,qf W:qc" in the position's stored frame (upper-right corner by default). */
  stones: string
  toPlay: 'B' | 'W'
  free: Free
  /** Moves out of this position (stored in the file's `moves` list with `from` = this id). */
  moves: MoveRec[]
}

export interface DbFile {
  db: string
  /** Relative to db/, e.g. "general/joseki/4-4-point.json". */
  path: string
  positions: PosRec[]
  /** Moves whose `from` is not a position of this file: kept as they are and reported by the validator. */
  loose: (MoveRec & { from: string })[]
}

/* ---- Ids ---- */

/** The sequence part of an id: "joseki/4-4 point:5b" → "joseki/4-4 point". */
export const seqOf = (id: string) => id.split(':')[0]
/** N written in the id (0 for the start of a sequence). */
export const nOf = (id: string) => {
  const m = id.match(/:(\d+)[a-z]*$/)
  return m ? Number(m[1]) : 0
}
export const isStartId = (id: string) => !id.includes(':')
/** Last part of a sequence, used as the default name: "joseki/4-4 point/3-3 invasion" → "3-3 invasion". */
export const seqName = (seq: string) => seq.split('/').pop()!.trim() || seq

/** A free id `<seq>:<n>`, `<seq>:<n>b`, … that is not in `taken`. */
export function nextId(seq: string, n: number, taken: (id: string) => boolean): string {
  for (let i = 0; ; i++) {
    const id = `${seq}:${n}${i ? String.fromCharCode(97 + i) : ''}`
    if (!taken(id)) return id
  }
}

/* ---- Stones ---- */

const sgfPt = ([x, y]: Pt) => String.fromCharCode(97 + x) + String.fromCharCode(97 + y)

export function parseStones(s: string): { B: Pt[]; W: Pt[] } {
  const out = { B: [] as Pt[], W: [] as Pt[] }
  for (const part of s.trim().split(/\s+/).filter(Boolean)) {
    const [c, list] = part.split(':')
    if (c !== 'B' && c !== 'W') continue
    for (const v of (list ?? '').split(',')) {
      const p = parseSgfPt(v)
      if (p) out[c].push(p)
    }
  }
  return out
}

export function boardOf(stones: string): SignMap {
  const map: SignMap = Array.from({ length: SIZE }, () => Array<Sign>(SIZE).fill(0))
  const { B, W } = parseStones(stones)
  for (const [x, y] of B) map[y][x] = 1
  for (const [x, y] of W) map[y][x] = -1
  return map
}

export function stonesOf(map: SignMap): string {
  const B: string[] = [], W: string[] = []
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (map[y][x]) (map[y][x] === 1 ? B : W).push(sgfPt([x, y]))
  B.sort()
  W.sort()
  return [B.length ? `B:${B.join(',')}` : '', W.length ? `W:${W.join(',')}` : ''].filter(Boolean).join(' ')
}

export const signOf = (c: 'B' | 'W'): Sign => (c === 'B' ? 1 : -1)
export const colorOf = (s: Sign): 'B' | 'W' => (s === -1 ? 'W' : 'B')
export const movePt = (m: string): Pt | null => (m === 'tenuki' ? null : parseSgfPt(m))
export const moveText = (pt: Pt | null) => (pt ? sgfPt(pt) : 'tenuki')

/* ---- Moves between two positions ---- */

/**
 * The point that turns `from` into `to` (SGF point in `from`'s stored frame), "tenuki" when only the
 * player changes, or null when no single move does it. `to` may be stored in another orientation.
 */
export function moveBetween(from: PosRec, to: PosRec): string | null {
  if (from.toPlay === to.toPlay) return null
  const a = boardOf(from.stones), b = boardOf(to.stones)
  const sign = signOf(from.toPlay)
  for (const t of SYMMETRIES) {
    const bt = transformMap(t, b)
    let added: Pt | null = null, ok = true
    for (let y = 0; y < SIZE && ok; y++)
      for (let x = 0; x < SIZE && ok; x++) {
        if (a[y][x] === bt[y][x]) continue
        if (!a[y][x] && bt[y][x] === sign && !added) added = [x, y]
        else if (a[y][x] !== -sign || bt[y][x]) ok = false // only captured stones may disappear
      }
    if (!ok) continue
    if (!added) return 'tenuki'
    try {
      const after = new GoBoard(a).makeMove(sign, added, { preventOverwrite: true, preventSuicide: true }).signMap as SignMap
      if (after.every((row, y) => row.every((s, x) => s === bt[y][x]))) return sgfPt(added)
    } catch {
      /* illegal: try another orientation */
    }
  }
  return null
}

/* ---- JSON (de)serialization ---- */

type Json = Record<string, unknown>
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [])
const tagsOf = (v: unknown): Tags => (v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Tags) } : {})

function recToJson(r: Rec, out: Json): Json {
  const comments = r.comments.map((c) => c.trim()).filter(Boolean)
  if (comments.length) out.comments = comments
  const tags = Object.fromEntries(Object.entries(r.tags).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)))
  if (Object.keys(tags).length) out.tags = tags
  return out
}

export function positionToJson(p: PosRec): Json {
  const out: Json = { id: p.id, stones: p.stones, toPlay: p.toPlay }
  if (p.free !== 'corner') out.free = p.free
  return recToJson(p, out)
}
export const moveToJson = (from: string, m: MoveRec): Json => recToJson(m, { from, to: m.to })

export function positionFromJson(j: Json): PosRec {
  const free = j.free === 'horizontal' || j.free === 'vertical' ? 'side' : FREE_VALUES.includes(j.free as Free) ? (j.free as Free) : 'corner'
  return { id: String(j.id), stones: String(j.stones ?? ''), toPlay: j.toPlay === 'W' ? 'W' : 'B', free, comments: texts(j.comments), tags: tagsOf(j.tags), moves: [] }
}

export function parseDbFile(db: string, path: string, text: string): DbFile {
  const j = JSON.parse(text) as { positions?: Json[]; moves?: Json[] }
  const positions = (j.positions ?? []).map(positionFromJson)
  const byId = new Map(positions.map((p) => [p.id, p]))
  const loose: DbFile['loose'] = []
  for (const m of j.moves ?? []) {
    const rec: MoveRec = { to: String(m.to), move: '', comments: texts(m.comments), tags: tagsOf(m.tags) }
    const from = byId.get(String(m.from))
    if (from) from.moves.push(rec)
    else loose.push({ ...rec, from: String(m.from) })
  }
  return { db, path, positions, loose }
}

/** Stable JSON text: positions first, then moves in the order of their positions, so diffs stay small. */
export function writeDbFile(f: DbFile): string {
  const moves = [...f.positions.flatMap((p) => p.moves.map((m) => moveToJson(p.id, m))), ...f.loose.map((m) => moveToJson(m.from, m))]
  return JSON.stringify({ positions: f.positions.map(positionToJson), moves }, null, 2) + '\n'
}
