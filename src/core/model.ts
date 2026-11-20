/**
 * Stored data model (docs/MODEL.md): positions with a unique id, each holding its moves, which point to
 * the id of the position they lead to. Database files are JSON; inside the app every record keeps its
 * fields as a property bag (`data`, SGF-style names such as XNAME or XCAT) so the panels and editors
 * can read and write them the same way for positions and moves.
 */
import type { Props } from './fields'
import { fieldOf, getSchema, keyOf, propOf } from './schema'
import { SIZE, parseSgfPt, type Pt, type Sign, type SignMap } from './geometry'

export type Free = 'corner' | 'horizontal' | 'vertical' | 'anywhere'
export const FREE_VALUES: Free[] = ['corner', 'horizontal', 'vertical', 'anywhere']

export interface MoveRec {
  /** SGF point such as "qc", or "tenuki". */
  move: string
  /** Id of the position it leads to (same database). */
  to: string
  data: Props
}

export interface PosRec {
  id: string
  /** "B:pd,qf W:qc" in the position's stored frame (upper-right corner by default). */
  stones: string
  toPlay: 'B' | 'W'
  free: Free
  data: Props
  moves: MoveRec[]
}

export interface DbFile {
  db: string
  /** Relative to db/, e.g. "general/joseki/4-4-point.json". */
  path: string
  positions: PosRec[]
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

/* ---- JSON (de)serialization ---- */

/**
 * Older separate texts that are now notes (docs/MODEL.md §1): each becomes one more note, with its lead word.
 * Applied when reading, so old files, drafts and imports convert the same way.
 */
const OLD_POS_NOTES: [string, string][] = [
  ['XRES', 'Outcome: '], ['XTEN', 'Tenuki: '], ['XAJI', 'Watch out: '], ['XPN', ''], ['XEYE', ''], ['XLIB', ''], ['XRULE', 'Rules: '], ['C', ''],
]
const OLD_MOVE_NOTES: [string, string][] = [['XMN', ''], ['C', '']]
export function mergeNotes(data: Props, into: 'XPW' | 'XMW') {
  for (const [k, lead] of into === 'XPW' ? OLD_POS_NOTES : OLD_MOVE_NOTES) {
    if (!data[k]?.length) continue
    data[into] = [...(data[into] ?? []), ...data[k].filter((t) => t.trim()).map((t) => lead + t)]
    delete data[k]
  }
}

/** Board drawings: stored apart from the values, under `marks`. */
export const MARK_PROPS = ['TR', 'SQ', 'CR', 'MA', 'LB', 'AR', 'LN', 'XWALL', 'XINF', 'XTB', 'XTW', 'XMOYO', 'XCUT', 'XEYEM', 'XWEAK', 'XLAD']
/** Older fields that no longer exist. */
const DROPPED = new Set(['XPB', 'XPBS', 'TE', 'BM', 'DO', 'IT', 'XREG'])
/** The former five-step evaluation, as a slider value. */
const OLD_EVAL: Record<string, string> = { 'B++': '1', 'B+': '0.5', '=': '0', 'W+': '-0.5', 'W++': '-1' }
const OWN = new Set(['XNAME', 'XPW', 'XMW', ...MARK_PROPS])

type Json = Record<string, unknown>
const packList = (v: string[]) => (v.length === 1 ? v[0] : v)
const unpack = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === '' || v === false ? [] : v === true ? ['1'] : [String(v)]

/** The `values` dictionary of a record: schema keys, in the schema's order, typed as the schema says. */
function valuesOf(data: Props): Json | undefined {
  const order = getSchema().fields.map((f) => f.key)
  const keys = Object.keys(data)
    .filter((p) => !OWN.has(p) && !DROPPED.has(p) && data[p]?.length)
    .map((p) => [keyOf(p), p] as const)
    .sort((a, b) => (order.indexOf(a[0]) + 1 || 999) - (order.indexOf(b[0]) + 1 || 999) || a[0].localeCompare(b[0]))
  if (!keys.length) return undefined
  return Object.fromEntries(
    keys.map(([k, p]) => {
      const f = fieldOf(k), v = data[p]
      if (f?.type === 'flag') return [k, true]
      if (f?.type === 'slider') return [k, Number(v[0])]
      if (f?.type === 'list' || f?.type === 'multi') return [k, v]
      return [k, packList(v)]
    }),
  )
}
function marksOf(data: Props): Json | undefined {
  const keys = MARK_PROPS.filter((k) => data[k]?.length)
  return keys.length ? Object.fromEntries(keys.map((k) => [k, packList(data[k])])) : undefined
}
/** Reads `values`, `marks` and the fields of older files into a property bag. */
function readFields(j: Json, data: Props) {
  for (const [k, v] of Object.entries((j.extra ?? {}) as Json)) data[k] = unpack(v) // older files
  const ev = (j.eval ?? {}) as Json // older files
  if (ev.difficulty !== undefined) data.XDIFF = unpack(ev.difficulty)
  if (j.status !== undefined) data.XCAT = unpack(j.status) // older move files
  for (const [k, v] of Object.entries((j.values ?? {}) as Json)) data[propOf(k)] = unpack(v)
  for (const [k, v] of Object.entries((j.marks ?? {}) as Json)) data[k] = unpack(v)
  if (data.XEV && OLD_EVAL[data.XEV[0]]) data.XEV = [OLD_EVAL[data.XEV[0]]]
  // Older descriptor tags ("eye space/4 points") are keys of their own now.
  if (data.XTAG) {
    const keep: string[] = []
    for (const t of data.XTAG) {
      const m = t.match(/^(eye space|surrounded|outside liberties|inside stones|arrangement|ko)\/(.+)$/)
      if (!m) keep.push(t)
      else data[m[1] === 'ko' ? 'ko-type' : m[1].replace(/ /g, '-')] = [m[2].replace(/ points$/, '')]
    }
    if (keep.length) data.XTAG = keep
    else delete data.XTAG
  }
  for (const k of DROPPED) delete data[k]
}

export function positionToJson(p: PosRec): Json {
  const out: Json = { id: p.id, stones: p.stones, toPlay: p.toPlay }
  if (p.free !== 'corner') out.free = p.free
  if (p.data.XNAME?.length) out.name = p.data.XNAME[0]
  if (p.data.XPW?.length) out.notes = p.data.XPW
  const values = valuesOf(p.data)
  if (values) out.values = values
  const marks = marksOf(p.data)
  if (marks) out.marks = marks
  out.moves = p.moves.map((m) => {
    const mo: Json = { move: m.move, to: m.to }
    if (m.data.XMW?.length) mo.notes = m.data.XMW
    const mv = valuesOf(m.data)
    if (mv) mo.values = mv
    const mm = marksOf(m.data)
    if (mm) mo.marks = mm
    return mo
  })
  return out
}

export function positionFromJson(j: Json): PosRec {
  const data: Props = {}
  if (j.name) data.XNAME = unpack(j.name)
  if (j.tags) data.XTAG = unpack(j.tags)
  if (j.notes) data.XPW = unpack(j.notes)
  readFields(j, data)
  mergeNotes(data, 'XPW')
  // Older life & death results did not name the color; every stored shape is a Black group.
  for (const k of ['XSB', 'XSW']) if (data[k]?.[0] === 'alive' || data[k]?.[0] === 'dead') data[k] = ['B-' + data[k][0]]
  const moves = ((j.moves ?? []) as Json[]).map((m) => {
    const md: Props = {}
    if (m.why !== undefined) md.XMW = [...unpack(m.why), ...unpack(m.notes)] // older files: "why" and a separate note
    else if (m.notes) md.XMW = unpack(m.notes)
    readFields(m, md)
    mergeNotes(md, 'XMW')
    return { move: String(m.move), to: String(m.to), data: md }
  })
  const free = FREE_VALUES.includes(j.free as Free) ? (j.free as Free) : 'corner'
  return { id: String(j.id), stones: String(j.stones ?? ''), toPlay: j.toPlay === 'W' ? 'W' : 'B', free, data, moves }
}

export function parseDbFile(db: string, path: string, text: string): DbFile {
  const j = JSON.parse(text) as { positions?: Json[] }
  return { db, path, positions: (j.positions ?? []).map(positionFromJson) }
}

/** Stable JSON text: one position per block, so diffs stay small. */
export function writeDbFile(f: DbFile): string {
  return JSON.stringify({ positions: f.positions.map(positionToJson) }, null, 2) + '\n'
}
