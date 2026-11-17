/** Collects the free-text messages shown for the current line (SPEC §8.5). */
import type { Segment } from './core/refs'
import type { Settings } from './settings'
import { moveFields, positionFields, type Ctx, type Step } from './view'
import type { MessageKind } from './ui/Message'
import { ptName, apply } from './core/geometry'
import { frame, moveOf } from './view'

export interface Msg {
  kind: MessageKind
  title: string
  db: string
  segments: Segment[]
  /** Index of the step in the path this message belongs to. */
  step: number
  /** Where it is shown. */
  place: 'callout' | 'move' | 'position' | 'history'
}

function moveName(ctx: Ctx, path: Step[], i: number) {
  const step = path[i]
  const m = moveOf(step)
  if (!m) return 'Start'
  const F = frame(ctx, path[i - 1])
  const sign = (F.swap ? -m.sign : m.sign) === 1 ? 'Black' : 'White'
  return `${sign} ${m.pt ? ptName(apply(F, m.pt)) : 'tenuki'}`
}

function forStep(ctx: Ctx, path: Step[], i: number, current: boolean, settings: Settings): Msg[] {
  const out: Msg[] = []
  const step = path[i]
  const name = moveName(ctx, path, i)
  if (step.edge) {
    const mf = moveFields(ctx, path[i - 1], step.edge)
    const place = current ? 'move' : 'history'
    for (const t of mf.text('XMW')) out.push({ kind: 'move', title: `${name} · why`, db: t.db, segments: t.segments, step: i, place })
    if (current) for (const t of mf.text('XMN')) out.push({ kind: 'note', title: 'Note on the move', db: t.db, segments: t.segments, step: i, place: 'move' })
  }
  const pf = positionFields(ctx, step)
  const place = current ? 'position' : 'history'
  for (const t of pf.text('XPW')) out.push({ kind: 'pos', title: current ? 'Position' : `${name} · position`, db: t.db, segments: t.segments, step: i, place })
  if (current) {
    for (const t of pf.text('XAJI')) out.push({ kind: 'warn', title: 'Watch out', db: t.db, segments: t.segments, step: i, place })
    for (const t of pf.text('XPN')) out.push({ kind: 'note', title: 'Note', db: t.db, segments: t.segments, step: i, place })
    for (const t of pf.text('C')) out.push({ kind: 'note', title: 'Comment', db: t.db, segments: t.segments, step: i, place })
  }
  return out
}

export function collectMessages(ctx: Ctx, path: Step[], settings: Settings): Msg[] {
  const last = path.length - 1
  const from = settings.history === 'line' ? 0 : settings.history === 'last3' ? Math.max(0, last - 3) : last
  const out: Msg[] = []
  for (let i = from; i < last; i++) out.push(...forStep(ctx, path, i, false, settings))
  out.push(...forStep(ctx, path, last, true, settings))
  return out
}
