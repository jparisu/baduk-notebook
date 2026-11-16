/** Visual references inside text: {{TYPE:points|label}} (SPEC §5). */
import { apply, parsePt, parseSgfPtList, ptName, type Pt, type Transform } from './geometry'
import type { Props } from './fields'

export type MarkType = 'TR' | 'SQ' | 'CR' | 'MA' | 'LB' | 'AR' | 'LN' | 'WALL' | 'INF' | 'TB' | 'TW' | 'CUT'

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
export function parseText(text: string, t: Transform, idPrefix: string): Segment[] {
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

/** Standard SGF markup and custom overlay properties of a node, in the file frame (SPEC §4.1, §4.5). */
export function propMarks(p: Props): Mark[] {
  const out: Mark[] = []
  for (const type of ['TR', 'SQ', 'CR', 'MA'] as const)
    for (const v of p[type] ?? []) for (const pt of parseSgfPtList(v)) out.push({ type, pts: [pt] })
  for (const v of p.LB ?? []) {
    const [pt, label] = v.split(':')
    const pts = parseSgfPtList(pt)
    if (pts.length) out.push({ type: 'LB', pts, label })
  }
  const pairs: [string, MarkType][] = [['AR', 'AR'], ['LN', 'LN'], ['XWALL', 'WALL'], ['XINF', 'INF']]
  for (const [prop, type] of pairs)
    for (const v of p[prop] ?? []) {
      const [a, b] = v.split(':').map((s) => parseSgfPtList(s)[0])
      if (a && b) out.push({ type, pts: [a, b] })
    }
  for (const [prop, type] of [['XTB', 'TB'], ['XTW', 'TW']] as const) {
    const pts = (p[prop] ?? []).flatMap(parseSgfPtList)
    if (pts.length) out.push({ type, pts })
  }
  for (const v of p.XCUT ?? []) for (const pt of parseSgfPtList(v)) out.push({ type: 'CUT', pts: [pt] })
  return out
}
