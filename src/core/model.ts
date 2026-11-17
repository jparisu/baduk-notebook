/**
 * Stored data model (docs/MODEL.md): positions with a unique id, each holding its moves, which point to
 * the id of the position they lead to. Database files are JSON; inside the app every record keeps its
 * fields as a property bag (`data`, SGF-style names such as XNAME or XCAT) so the panels and editors
 * can read and write them the same way for positions and moves.
 */
import type { Props } from './fields'
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

/** Position fields with their own JSON name; everything else goes to `extra` with its SGF name. */
const POS_FIELDS: [string, string, 'one' | 'list' | 'num'][] = [
  ['name', 'XNAME', 'one'],
  ['tags', 'XTAG', 'list'],
  ['notes', 'XPW', 'one'],
]
const EVAL_FIELDS: [string, string, 'one' | 'num'][] = [
  ['balance', 'XPB', 'num'],
  ['difficulty', 'XDIFF', 'one'],
]
const MOVE_FIELDS: [string, string][] = [
  ['status', 'XCAT'],
  ['why', 'XMW'],
  ['notes', 'XMN'],
]
const EXTRA_ORDER = [
  'XALIAS', 'XSUM', 'XSRC', 'XERA', 'XST', 'XEV', 'XPBS', 'XSEN', 'XSB', 'XSW', 'XRESB', 'XRESW', 'XEYE', 'XLIB', 'XRES', 'XTEN', 'XAJI', 'XPN',
  'XSIZE', 'XSURR', 'XOLIB', 'XINSIDE', 'XARR', 'XVITAL', 'XKOT', 'XRULE', 'XREG',
  'XSTY', 'XPUR', 'XCOND', 'XLINK', 'TE', 'BM', 'DO', 'IT',
  'TR', 'SQ', 'CR', 'MA', 'LB', 'AR', 'LN', 'XWALL', 'XINF', 'XTB', 'XTW', 'XMOYO', 'XCUT', 'XEYEM', 'XWEAK', 'XLAD',
]
const rank = (k: string) => {
  const i = EXTRA_ORDER.indexOf(k)
  return i < 0 ? EXTRA_ORDER.length : i
}

type Json = Record<string, unknown>
const packList = (v: string[]) => (v.length === 1 ? v[0] : v)
const unpack = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === '' ? [] : [String(v)])

function extraOf(data: Props, skip: Set<string>): Json | undefined {
  const keys = Object.keys(data).filter((k) => !skip.has(k) && data[k]?.length).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  if (!keys.length) return undefined
  return Object.fromEntries(keys.map((k) => [k, packList(data[k])]))
}

export function positionToJson(p: PosRec): Json {
  const out: Json = { id: p.id, stones: p.stones, toPlay: p.toPlay }
  if (p.free !== 'corner') out.free = p.free
  for (const [name, prop, kind] of POS_FIELDS) {
    const v = p.data[prop]
    if (v?.length) out[name] = kind === 'list' ? v : v[0]
  }
  const ev: Json = {}
  for (const [name, prop, kind] of EVAL_FIELDS) {
    const v = p.data[prop]?.[0]
    if (v !== undefined && v !== '') ev[name] = kind === 'num' && Number.isFinite(Number(v)) ? Number(v) : v
  }
  if (Object.keys(ev).length) out.eval = ev
  const extra = extraOf(p.data, new Set([...POS_FIELDS.map((f) => f[1]), ...EVAL_FIELDS.map((f) => f[1])]))
  if (extra) out.extra = extra
  out.moves = p.moves.map((m) => {
    const mo: Json = { move: m.move, to: m.to }
    for (const [name, prop] of MOVE_FIELDS) if (m.data[prop]?.length) mo[name] = m.data[prop][0]
    const ex = extraOf(m.data, new Set(MOVE_FIELDS.map((f) => f[1])))
    if (ex) mo.extra = ex
    return mo
  })
  return out
}

export function positionFromJson(j: Json): PosRec {
  const data: Props = {}
  for (const [name, prop] of POS_FIELDS) {
    const v = unpack(j[name])
    if (v.length) data[prop] = v
  }
  const ev = (j.eval ?? {}) as Json
  for (const [name, prop] of EVAL_FIELDS) {
    const v = unpack(ev[name])
    if (v.length) data[prop] = v
  }
  for (const [k, v] of Object.entries((j.extra ?? {}) as Json)) data[k] = unpack(v)
  const moves = ((j.moves ?? []) as Json[]).map((m) => {
    const md: Props = {}
    for (const [name, prop] of MOVE_FIELDS) {
      const v = unpack(m[name])
      if (v.length) md[prop] = v
    }
    for (const [k, v] of Object.entries((m.extra ?? {}) as Json)) md[k] = unpack(v)
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
