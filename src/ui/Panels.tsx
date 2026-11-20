/**
 * Panels of the layout (SPEC §8.1):
 * left  — "This joseki" (the label of the position);
 * right — position evaluation, last move (the "why"), next moves.
 */
import type { ComponentChildren } from 'preact'
import { CATEGORIES, type Category } from '../core/fields'
import { fieldsFor, propOf, valueLabel, type FieldDef } from '../core/schema'
import { apply, ptName } from '../core/geometry'
import { labelsAt } from '../core/graph'
import type { Msg } from '../messages'
import type { Settings } from '../settings'
import { candidates, entryFields, frame, lineFields, moveOf, type Fields, inBook, labelStart, moveFields, positionFields, primaryLabel, type Candidate, type Ctx, type Step } from '../view'
import { CONDITION_ICONS, IconLabel, PURPOSE_ICONS, SHAPE_ICONS, STATUS_ICONS, STYLE_ICONS } from './icons'
import { Rich, type RefHandlers } from './Rich'
import { Fold } from './Card'

export function Row({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="f">
      <div class="fl">{label}</div>
      <div class="fv">{children}</div>
    </div>
  )
}

export function CategoryDot({ cat }: { cat: Category | null }) {
  const k = cat ? CATEGORIES[cat] : null
  return <span class={`dot ${k?.ring ? 'ring' : ''}`} style={{ background: k?.color ?? '#888', borderColor: k?.color ?? '#888' }} aria-hidden />
}

/** Marker used in lists: same shapes as on the board (solid, dashed ring for a new variation, ring for punishment). */
export function MoveMark({ cat, variation }: { cat: Category | null; variation?: boolean }) {
  const k = cat ? CATEGORIES[cat] : null
  const color = k?.color ?? '#888'
  const cls = variation ? 'mk dash' : k?.ring ? 'mk ring' : k && !k.good ? 'mk sym' : 'mk solid'
  return (
    <span class={cls} style={{ '--c': color } as never} aria-hidden>
      {cls === 'mk sym' ? k!.symbol : ''}
    </span>
  )
}

export const colorWord = (s: number) => (s === 1 ? 'Black' : s === -1 ? 'White' : 'Either')

export function StoneIcon({ sign, size = 16 }: { sign: number; size?: number }) {
  return <span class={`stone-ico ${sign === 1 ? 'b' : 'w'}`} style={{ width: size, height: size }} aria-hidden />
}

interface Common {
  ctx: Ctx
  path: Step[]
  settings: Settings
  messages: Msg[]
  refs: RefHandlers
  dbColor: (db: string) => string
  entryName: (id: string) => string
}

const DbTag = ({ db, color }: { db: string; color: string }) => (
  <span class="tag db-tag" style={{ borderColor: color, color }}>{db}</span>
)

/** Sticky note for personal notes and comments. */
export function NoteCard({ who, color, children }: { who: string; color: string; children: ComponentChildren }) {
  return (
    <div class="note-card">
      <span class="who" style={{ color }}>{who}</span>
      <div>{children}</div>
    </div>
  )
}

/** Amber card for warnings (aji). */
export function WarnCard({ children, db, color }: { children: ComponentChildren; db: string; color: string }) {
  return (
    <div class="warn-card" role="note">
      <span class="warn-badge" aria-hidden>!</span>
      <div>
        <b>Watch out</b> <DbTag db={db} color={color} />
        <div>{children}</div>
      </div>
    </div>
  )
}

/** Names of the labels met along the line, in order (Empty corner › 3-3 invasion › hane). */
export function crumbsOf(ctx: Ctx, path: Step[]): string[] {
  const out: string[] = []
  path.forEach((s, i) => {
    for (const e of ctx.graph.entries.values()) {
      if (!e.defined || e.root !== s.key || !e.contribs.some((c) => ctx.active.has(c.db))) continue
      if (i === 0 || labelsAt(ctx.graph, s.key, ctx.active).includes(e.id)) if (!out.includes(e.id)) out.push(e.id)
    }
  })
  return out
}

/* ---------- Left: This joseki ---------- */

/** Keys shown at the top of This joseki; the others go to Details. */
const MAIN_KEYS = ['difficulty', 'tags']

export function JosekiInfo(p: Common & { onOpenLabel: (id: string) => void; onCopyLink?: (id: string) => void }) {
  const { ctx, path } = p
  const label = primaryLabel(ctx, path)
  if (!label) {
    return <p class="hint">{inBook(ctx, path[path.length - 1]) ? 'This position has no name yet.' : 'Not in your databases.'}</p>
  }
  const entry = ctx.graph.entries.get(label)!
  const at = labelStart(ctx, path, label)
  const ef = entryFields(ctx, label, path[at])
  const icons = p.settings.icons
  const crumbs = crumbsOf(ctx, path)
  const others = labelsAt(ctx.graph, path[path.length - 1].key, ctx.active).filter((l) => l !== label && ctx.graph.entries.get(l)?.defined)
  const details = fieldsFor('sequence').filter((f) => f.key !== 'summary' && !MAIN_KEYS.includes(f.key))
  return (
    <div class="joseki-info subpanels">
      <div class="sub-main">
      <p class="info-title"><span class="db-ul" style={{ textDecorationColor: p.dbColor(entry.contribs[0]?.db ?? '') }} title={`From ${entry.contribs[0]?.db}`}>{p.entryName(label)}</span></p>
      {crumbs.length > 1 && (
        <div class="crumbs" aria-label="Names along this line">
          {crumbs.map((c, i) => (
            <span key={c}>
              {i > 0 && <span class="sep">›</span>}
              {c === label ? <b>{p.entryName(c)}</b> : <button class="link" onClick={() => p.onOpenLabel(c)}>{p.entryName(c)}</button>}
            </span>
          ))}
        </div>
      )}
      <div class="info-links">
        {at < path.length - 1 && (
          <button class="link go-first" onClick={() => p.onOpenLabel(label)}>⏮ Go to its first move{at > 0 ? ` (move ${at})` : ''}</button>
        )}
        {p.onCopyLink && <button class="link" onClick={() => p.onCopyLink!(label)} title="Copy a link that opens this joseki at its first move">🔗 Copy link</button>}
      </div>
      <div class="kvs">
        <Row label="Sequence">{entry.id.replace(/\//g, ' › ')}</Row>
        <ValueRows fields={fieldsFor('sequence').filter((f) => MAIN_KEYS.includes(f.key))} f={ef} icons={icons} hidden={p.settings.hiddenKeys} />
      </div>
      </div>
      {ef.text('XSUM').length > 0 && !p.settings.hiddenKeys.includes('summary') && (
        <Fold id="joseki-description" title="Description">
          {ef.text('XSUM').map((t, i) => <p key={i} class="desc"><Rich segments={t.segments} h={p.refs} /></p>)}
        </Fold>
      )}
      {details.some((fd) => ef.one(propOf(fd.key)) || ef.list(propOf(fd.key)).length) && (
        <Fold id="joseki-details" title="Details">
          <div class="kvs"><ValueRows fields={details} f={ef} icons={icons} hidden={p.settings.hiddenKeys} /></div>
        </Fold>
      )}
      {others.length > 0 && (
        <p class="also">Also part of: {others.map((l) => <button key={l} class="chip" onClick={() => p.onOpenLabel(l)}>{p.entryName(l)}</button>)}</p>
      )}
    </div>
  )
}

/* ---------- Right: Position evaluation ---------- */

/** The keys of the schema that have a value here, each shown the way its type asks for. */
export function ValueRows({ fields: all, f, icons, only, hidden = [] }: { fields: FieldDef[]; f: Fields; icons: boolean; only?: 'bars' | 'rows'; hidden?: string[] }) {
  const fields = all.filter((fd) => !hidden.includes(fd.key))
  // A key that trades places with another one under Swap colors ("Black plays first" ↔ "White plays first").
  const shown = (fd: FieldDef) => {
    const prop = propOf(fd.key)
    if (!fd.swapKey) return prop
    const c = f.firstWith(prop) ?? f.firstWith(propOf(fd.swapKey))
    return c && f.swapped(c) ? propOf(fd.swapKey) : prop
  }
  const out = fields.flatMap((fd) => {
    const prop = shown(fd)
    if (fd.type === 'slider') {
      if (only === 'rows') return []
      const v = Number(f.one(prop)?.value)
      if (!Number.isFinite(v)) return []
      return [
        <div key={fd.key} class="eval-bar-row" title={fd.label}>
          <span class="bar-end">{fd.ends?.[0] ?? ''}</span>
          <div class="balance-bar" role="img" aria-label={`${fd.label}: ${v > 0.15 ? fd.ends?.[1] : v < -0.15 ? fd.ends?.[0] : 'even'}`}><i style={{ left: `${50 + Math.max(-1, Math.min(1, v)) * 50}%` }} /></div>
          <span class="bar-end">{fd.ends?.[1] ?? ''}</span>
        </div>,
      ]
    }
    if (only === 'bars') return []
    const vals = fd.type === 'list' || fd.type === 'multi' ? f.list(prop) : [f.one(prop)?.value].filter((x): x is string => !!x)
    if (!vals.length || (fd.type === 'flag' && vals[0] !== '1')) return []
    const opt = (v: string) => fd.options?.find((o) => o.value === v)
    const show = (v: string) => {
      const o = opt(v)
      return (
        <span key={v} class="value">
          {o?.color && <span class="dot" style={{ background: o.color, borderColor: o.color }} />}
          {icons && o?.icon && !o.color && <span class="ico" aria-hidden>{o.icon}</span>}
          {valueLabel(fd, v)}
        </span>
      )
    }
    if (fd.type === 'flag') return [<Row key={fd.key} label={fd.label}>{icons && fd.icon ? <span class="ico" aria-hidden>{fd.icon}</span> : null}Yes</Row>]
    return [<Row key={fd.key} label={fd.label}><span class="values">{vals.map(show)}</span></Row>]
  })
  return <>{out}</>
}

export function PositionEval(p: Common) {
  const { ctx, path } = p
  const step = path[path.length - 1]
  if (!inBook(ctx, step)) return <p class="hint">Not in your databases. Keep playing, or save your line.</p>
  const pf = lineFields(ctx, path) // values inherited from earlier positions of the line count too
  const icons = p.settings.icons
  const fields = fieldsFor('position')
  const here = p.messages.filter((m) => m.place === 'position')
  const hasValue = fields.some((fd) => pf.one(propOf(fd.key)) || pf.list(propOf(fd.key)).length)
  return (
    <div class="pos-eval">
      <ValueRows fields={fields} f={pf} icons={icons} only="bars" hidden={p.settings.hiddenKeys} />
      <div class="kvs pos-values"><ValueRows fields={fields} f={pf} icons={icons} only="rows" hidden={p.settings.hiddenKeys} /></div>
      {/* Notes: the first database's as plain text, other databases' (your own notes) as cards with their color. */}
      {here.filter((m) => m.kind === 'pos').map((m, i) =>
        m.db === ctx.order[0] ? (
          <p key={'p' + i} class="pos-text"><Rich segments={m.segments} h={p.refs} /></p>
        ) : (
          <NoteCard key={'p' + i} who={m.db} color={p.dbColor(m.db)}><Rich segments={m.segments} h={p.refs} /></NoteCard>
        ),
      )}
      {here.filter((m) => m.kind === 'warn').map((m, i) => (
        <WarnCard key={'w' + i} db={m.db} color={p.dbColor(m.db)}><Rich segments={m.segments} h={p.refs} /></WarnCard>
      ))}
      {here.filter((m) => m.kind === 'note').map((m, i) => (
        <NoteCard key={'n' + i} who={`${m.db} · ${m.title.toLowerCase()}`} color={p.dbColor(m.db)}><Rich segments={m.segments} h={p.refs} /></NoteCard>
      ))}
      {!hasValue && !here.length && <p class="hint">Nothing stored about this position yet.</p>}
    </div>
  )
}

/* ---------- Right: Last move (the "why") ---------- */

export function LastMove(p: Common & { onGoTo: (n: number) => void }) {
  const { ctx, path, settings: s } = p
  const step = path[path.length - 1]
  const parent = path.length > 1 ? path[path.length - 2] : null
  const mf = parent && step.edge ? moveFields(ctx, parent, step.edge) : null
  const cand: Candidate | undefined = parent && step.edge ? candidates(ctx, parent).find((c) => c.edge === step.edge) : undefined
  const k = cand?.cat ? CATEGORIES[cand.cat] : null
  // The point actually played (a database move can be played in a mirrored orientation).
  const m = moveOf(step)
  const played = parent && m?.pt ? apply(frame(ctx, parent), m.pt) : cand?.pt ?? null
  const history = p.messages.filter((m) => m.place === 'history')
  const why = p.messages.filter((m) => m.place === 'move' && m.kind === 'move')
  const notes = p.messages.filter((m) => m.place === 'move' && m.kind === 'note')
  return (
    <div class="why-card" style={{ '--cat': k?.color ?? 'var(--line)' } as never}>
      {history.length > 0 && (
        <div class="history">
          {history.map((m, i) => (
            <button key={i} class="history-item" onClick={() => p.onGoTo(m.step)}>
              <b>{m.title}</b> <Rich segments={m.segments} h={p.refs} />
            </button>
          ))}
        </div>
      )}
      {!parent && <p class="hint">Start of the line. Play a move or pick one of the next moves.</p>}
      {parent && !cand && <p class="hint">{inBook(ctx, step) ? 'Played freely; the position is known.' : 'Played freely; not in your databases.'}</p>}
      {cand && (
        <>
          <div class="why-head">
            <span class="move-badge"><StoneIcon sign={cand.sign} size={22} /><span class="db-ul" style={{ textDecorationColor: p.dbColor(cand.dbs[0]) }} title={`From ${cand.dbs.join(', ')}`}>{colorWord(cand.sign)} {played ? ptName(played) : 'tenuki'}</span></span>
            {k && <span class="cat-pill">{k.label}</span>}
          </div>
          {why.map((m, i) => <p key={i} class="why-text"><Rich segments={m.segments} h={p.refs} /></p>)}
          {!why.length && <p class="hint">No explanation stored for this move.</p>}
          <div class="tags">
            {mf && fieldsFor('move').filter((fd) => fd.key !== 'category' && !(s.hiddenKeys ?? []).includes(fd.key)).flatMap((fd) => {
              const prop = propOf(fd.key)
              const vals = fd.type === 'list' || fd.type === 'multi' ? mf.list(prop) : [mf.one(prop)?.value].filter((x): x is string => !!x)
              return vals.map((v) => {
                const o = fd.options?.find((x) => x.value === v)
                return <span key={fd.key + v} class="tag" title={fd.label}>{s.icons && o?.icon ? <span class="ico" aria-hidden>{o.icon}</span> : null}{fd.type === 'flag' ? fd.label : valueLabel(fd, v)}</span>
              })
            })}
          </div>
          {notes.map((m, i) => (
            <NoteCard key={i} who={`${m.db} · note`} color={p.dbColor(m.db)}><Rich segments={m.segments} h={p.refs} /></NoteCard>
          ))}
        </>
      )}
    </div>
  )
}

/* ---------- Right: Next moves ---------- */

/** True when a good move leads into another named variation (drawn dashed). */
export function isVariation(ctx: Ctx, path: Step[], c: Candidate, here: string | null): boolean {
  if (!c.cat || !CATEGORIES[c.cat].good) return false
  const next = primaryLabel(ctx, [...path, c.step])
  return !!next && next !== here
}

export function NextMoves(p: Common & {
  side: 1 | -1
  setSide: (s: 1 | -1) => void
  highlighted: string | null
  onHighlight: (key: string | null) => void
  onPlay: (c: Candidate) => void
}) {
  const { ctx, path } = p
  const step = path[path.length - 1]
  const all = candidates(ctx, step).filter((c) => !c.cat || !p.settings.hiddenCategories.includes(c.cat))
  const both = all.some((c) => c.sign === 1) && all.some((c) => c.sign === -1)
  const list = both ? all.filter((c) => c.sign === p.side) : all
  const here = primaryLabel(ctx, path)
  const variation = (c: Candidate) => isVariation(ctx, path, c, here)
  const joseki = list.filter((c) => (!c.cat || CATEGORIES[c.cat].good) && !variation(c))
  const variations = list.filter(variation)
  const bad = list.filter((c) => c.cat && !CATEGORIES[c.cat].good)
  // "4-4 point · 3-3 invasion · double hane" seen from "… · hane" reads as "double hane".
  const short = (id: string) => {
    const a = p.entryName(id).split(' · '), h = here ? p.entryName(here).split(' · ') : []
    let i = 0
    while (i < a.length - 1 && i < h.length && a[i] === h[i]) i++
    return a.slice(i).join(' · ')
  }
  const row = (c: Candidate) => {
    const next = primaryLabel(ctx, [...path, c.step])
    return (
      <button
        key={c.step.key + c.sign}
        class={`mv ${p.highlighted === c.step.key ? 'hl' : ''}`}
        onPointerEnter={(e) => e.pointerType === 'mouse' && p.onHighlight(c.step.key)}
        onPointerLeave={() => p.onHighlight(null)}
        onClick={() => p.onPlay(c)}
      >
        <MoveMark cat={c.cat} variation={variation(c)} />
        <b>{c.pt ? ptName(c.pt) : 'Tenuki'}</b>
        <span class="what">
          {c.cat ? CATEGORIES[c.cat].label : 'Unclassified'}
          {next && next !== here && <span class="to" title={p.entryName(next)}> → {short(next)}</span>}
          {c.label ? ` · ${c.label}` : ''}
        </span>
      </button>
    )
  }
  return (
    <div class="next-moves">
      {both && (
        <div class="seg side-tabs" role="tablist" aria-label="Side to play">
          <button role="tab" aria-selected={p.side === 1} class={p.side === 1 ? 'on' : ''} onClick={() => p.setSide(1)}>● Black plays</button>
          <button role="tab" aria-selected={p.side === -1} class={p.side === -1 ? 'on' : ''} onClick={() => p.setSide(-1)}>○ White plays</button>
        </div>
      )}
      {list.length === 0 && <p class="hint">{inBook(ctx, step) ? 'No stored continuation.' : 'Not in your databases.'}</p>}
      {joseki.length > 0 && (<><div class="group">Good moves</div>{joseki.map(row)}</>)}
      {variations.length > 0 && (<><div class="group">Variations</div>{variations.map(row)}</>)}
      {bad.length > 0 && (<><div class="group">Mistakes and traps</div>{bad.map(row)}</>)}
    </div>
  )
}
