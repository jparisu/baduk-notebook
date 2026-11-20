/** Visual references inside text: {{TYPE:points|label}} (SPEC §5). */
import { apply, parsePt, ptName, type Pt, type Sign, type Transform } from './geometry'

export type MarkType = 'TR' | 'SQ' | 'CR' | 'MA' | 'LB' | 'AR' | 'LN' | 'WALL' | 'INF' | 'TB' | 'TW' | 'CUT' | 'EYE'

export interface Mark {
  type: MarkType
  pts: Pt[] // one point per mark, or [from, to] for AR/LN/WALL/INF
  label?: string
  color?: string
}

export type Segment = { text: string } | { ref: Mark[]; label: string; id: string }

const RE = /\{\{([A-Z]{2,4}):([^|}]*)(?:\|([^}]*))?\}\}/g
const PAIR_TYPES = new Set(['AR', 'LN', 'WALL', 'INF'])

/** Parses one reference body (e.g. "TR", "Q17,Q16") into marks in the file frame. */
function parseRef(type: string, body: string): Mark[] {
  const t = type as MarkType
  if (PAIR_TYPES.has(t)) {
    return body.split(',').flatMap((pair) => {
      const [a, b] = pair.split('-').map(parsePt)
      return a && b ? [{ type: t, pts: [a, b] }] : []
    })
  }
  if (t === 'TB' || t === 'TW') {
    const pts: Pt[] = []
    for (const part of body.split(',')) {
      const [a, b] = part.split(':').map(parsePt)
      if (!a) continue
      const q = b ?? a
      for (let x = Math.min(a[0], q[0]); x <= Math.max(a[0], q[0]); x++)
        for (let y = Math.min(a[1], q[1]); y <= Math.max(a[1], q[1]); y++) pts.push([x, y])
    }
    return pts.length ? [{ type: t, pts }] : []
  }
  if (t === 'LB') {
    return body.split(',').flatMap((part) => {
      const [p, label] = part.split('=')
      const pt = parsePt(p)
      return pt ? [{ type: t, pts: [pt], label: label ?? '' }] : []
    })
  }
  return body.split(',').flatMap((p) => {
    const pt = parsePt(p)
    return pt ? [{ type: t, pts: [pt] }] : []
  })
}

export const transformMarks = (t: Transform, marks: Mark[]): Mark[] =>
  marks.map((m) => ({ ...m, pts: m.pts.map((p) => apply(t, p)) }))

/**
 * Splits text into plain parts and references. Points are transformed with `t` (file frame → display frame).
 * A reference without a label shows its (transformed) coordinate.
 */
/**
 * Player words: {{Black}} / {{White}} follow the display's color swap; {{Player}} is the player who made
 * the move (in a move text) or who plays next (in a position text), {{Opponent}} the other one.
 * Lowercase tokens ({{player}}) give lowercase words.
 */
export function playerWords(text: string, swap: boolean, player: Sign | null): string {
  return text.replace(/\{\{(black|white|player|opponent)\}\}/gi, (all, word: string) => {
    const w = word.toLowerCase()
    let sign: Sign = w === 'black' ? 1 : w === 'white' ? -1 : player ?? 0
    if (!sign) return all
    if (w === 'opponent') sign = -sign as Sign
    if (swap) sign = -sign as Sign
    const name = sign === 1 ? 'Black' : 'White'
    return word[0] === word[0].toLowerCase() ? name.toLowerCase() : name
  })
}

export function parseText(text: string, t: Transform, idPrefix: string, player: Sign | null = null): Segment[] {
  text = playerWords(text, t.swap, player)
  const out: Segment[] = []
  let last = 0, i = 0
  for (const m of text.matchAll(RE)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) })
    const marks = transformMarks(t, parseRef(m[1], m[2]))
    const label = m[3] ?? marks.map((mk) => mk.pts.map(ptName).join('–')).join(', ')
    out.push(marks.length ? { ref: marks, label, id: `${idPrefix}:${i++}` } : { text: m[3] ?? m[0] })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** Mark types of the `board` tag and of references in comments. */
export const MARK_TYPES: MarkType[] = ['TR', 'SQ', 'CR', 'MA', 'LB', 'AR', 'LN', 'WALL', 'INF', 'TB', 'TW', 'CUT', 'EYE']

/**
 * The `board` tag (docs/MODEL.md §3.2): a list of entries in the reference syntax without braces, in the
 * record's stored frame — "TR:Q16,R17", "AR:Q16-R14", "LB:Q16=A", "EYE:S18".
 */
export function boardMarks(entries: string[]): Mark[] {
  return entries.flatMap((e) => {
    const m = e.trim().match(/^([A-Z]{2,4}):(.*)$/)
    return m && MARK_TYPES.includes(m[1] as MarkType) ? parseRef(m[1], m[2]) : []
  })
}

/** Writes marks back as `board` entries, one per type. */
export function writeBoard(marks: Mark[]): string[] {
  const by = new Map<MarkType, string[]>()
  for (const m of marks) {
    const body = PAIR_TYPES.has(m.type) ? `${ptName(m.pts[0])}-${ptName(m.pts[1])}` : m.type === 'LB' ? `${ptName(m.pts[0])}=${m.label ?? ''}` : m.pts.map(ptName).join(',')
    by.set(m.type, [...(by.get(m.type) ?? []), body])
  }
  return MARK_TYPES.filter((t) => by.has(t)).map((t) => `${t}:${by.get(t)!.join(',')}`)
}
