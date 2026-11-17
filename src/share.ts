/**
 * Shareable links (SPEC §8.9):
 *   ?open=<sequence id>     open a sequence at its first position, e.g. joseki/4-4+point (empty corner when absent)
 *   &line=qc.pc.qd          moves after the start, as SGF points in the start's stored orientation;
 *                           "-" is a pass; a move whose color does not alternate is prefixed with B or W
 *   &view=br-m-s            corner (tl, tr, bl, br), m = mirrored, s = colors swapped
 */
import { apply, applySign, inverse, type Corner, type DisplayOptions, type Pt, type Sign } from './core/geometry'
import { sgfPoint } from './edit/sgfio'
import { freeStep, moveOf, node, startStep, toMove, type Ctx, type Start, type Step } from './view'

export interface Shared {
  start: Start
  line: string
  view: DisplayOptions | null
}

const parseSgf = (s: string): Pt | null => {
  if (s.length !== 2) return null
  const x = s.charCodeAt(0) - 97, y = s.charCodeAt(1) - 97
  return x >= 0 && x < 19 && y >= 0 && y < 19 ? [x, y] : null
}

/** Moves of a line in the start's stored orientation. */
export function encodeLine(ctx: Ctx, path: Step[]): string {
  let expected: Sign = ctx.graph.nodes.get(path[0].key)?.toMove || path[0].toMove || 1
  expected = applySign(path[0].D, expected) || 1
  return path
    .slice(1)
    .map((s, i) => {
      const m = moveOf(s)!
      const D = path[i].D // parent's canonical frame → stored frame
      const sign = applySign(D, m.sign)
      const body = m.pt ? sgfPoint(apply(D, m.pt)) : '-'
      const out = (sign === expected ? '' : sign === 1 ? 'B' : 'W') + body
      expected = (-sign) as Sign
      return out
    })
    .join('.')
}

/** Replays a shared line; stops at the first move that cannot be played. */
export function decodeLine(ctx: Ctx, start: Start, line: string): Step[] {
  const out = [startStep(ctx, start)]
  if (!line) return out
  let expected: Sign = applySign(out[0].D, toMoveCanon(ctx, out[0])) || 1
  for (const tok of line.split('.')) {
    const m = tok.match(/^([BW])?(-|[a-s]{2})$/)
    if (!m) break
    const sign: Sign = m[1] ? (m[1] === 'B' ? 1 : -1) : expected
    const pt = m[2] === '-' ? null : parseSgf(m[2])
    if (m[2] !== '-' && !pt) break
    const parent = out[out.length - 1]
    const toCanon = inverse(parent.D)
    const cpt = pt ? apply(toCanon, pt) : null
    if (cpt && node(ctx, parent).board[cpt[1]][cpt[0]]) break // occupied: the link is wrong from here on
    try {
      out.push(freeStep(ctx, parent, applySign(toCanon, sign), cpt))
    } catch {
      break
    }
    expected = (-sign) as Sign
  }
  return out
}

const toMoveCanon = (ctx: Ctx, s: Step): Sign => ctx.graph.nodes.get(s.key)?.toMove ?? s.toMove ?? 0

export function encodeView(v: DisplayOptions): string {
  if (v.corner === 'tr' && !v.mirror && !v.swap) return ''
  return [v.corner, v.mirror ? 'm' : '', v.swap ? 's' : ''].filter(Boolean).join('-')
}

export function decodeView(s: string | null): DisplayOptions | null {
  if (!s) return null
  const parts = s.split('-')
  const corner = (['tl', 'tr', 'bl', 'br'].includes(parts[0]) ? parts[0] : 'tr') as Corner
  return { corner, mirror: parts.includes('m'), swap: parts.includes('s') }
}

export function readUrl(search = location.search): Shared | null {
  const q = new URLSearchParams(search)
  if (!q.has('open') && !q.has('line') && !q.has('view')) return null
  const open = q.get('open')
  return { start: open ? { kind: 'label', id: open } : { kind: 'empty' }, line: q.get('line') ?? '', view: decodeView(q.get('view')) }
}

/** The link for a position. Starts other than the empty corner or a label have no link. */
export function linkFor(ctx: Ctx, start: Start, path: Step[], view: DisplayOptions): string | null {
  if (start.kind === 'setup') return null
  const q = new URLSearchParams()
  if (start.kind === 'label') q.set('open', start.id)
  const line = encodeLine(ctx, path)
  if (line) q.set('line', line)
  const v = encodeView(view)
  if (v) q.set('view', v)
  const s = q.toString().replace(/%2C/g, ',').replace(/%2F/g, '/')
  return `${location.origin}${location.pathname}${s ? '?' + s : ''}`
}

export { toMove }
