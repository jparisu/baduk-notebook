/**
 * Panels of the layout (SPEC §8.1):
 * left  — "This joseki" (the label of the position);
 * right — position evaluation, last move (the "why"), next moves.
 */
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { Link2 } from 'lucide-preact'
import { CATEGORIES, type Category } from '../core/kinds'
import { BALANCE_LEVELS, balanceText, defOf, describe, labelOf, typeOf, valueLabel, asList } from '../core/tags'
import { apply, ptName } from '../core/geometry'
import { labelsAt } from '../core/graph'
import type { Msg } from '../messages'
import type { Settings } from '../settings'
import { candidates, entryFields, frame, lineFields, mainMove, moveOf, type Fields, inBook, labelStart, moveFields, primaryLabel, type Candidate, type Ctx, type Step } from '../view'
import { Rich, type RefHandlers } from './Rich'
import { Fold } from './Card'

export function Row({ label, title, children }: { label: string; title?: string; children: ComponentChildren }) {
  return (
    <div class="f">
      <div class="fl" title={title}>{label}</div>
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

/** A comment as its own block, edged with its database's color; its header folds it. */
export function CommentCard({ db, color, children, preview }: { db: string; color: string; children: ComponentChildren; preview: string }) {
  const [open, setOpen] = useState(true)
  return (
    <div class={`comment-card ${open ? '' : 'closed'}`} style={{ '--db': color } as never}>
      <button class="comment-head" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? 'Fold this comment' : 'Open this comment'}>
        <span class="who">{db}</span>
        {!open && <span class="peek">{preview}</span>}
        <span class="chev" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div class="comment-body">{children}</div>}
    </div>
  )
}

/** Plain text of a comment, for a folded preview. */
const plainText = (segments: { text?: string; label?: string }[]) => {
  const t = segments.map((x) => x.text ?? x.label ?? '').join('')
  return t.length > 70 ? t.slice(0, 69) + '…' : t
}

/**
 * A name without the part it shares with the name before it: "4-4 point · 3-3 invasion · extend" after
 * "4-4 point · 3-3 invasion" reads "extend". When the earlier name is not its beginning, it stays whole.
 */
export function shortAfter(prev: string | null, name: string): string {
  if (!prev) return name
  const a = name.split(' · '), b = prev.split(' · ')
  return b.length < a.length && b.every((x, i) => x === a[i]) ? a.slice(b.length).join(' · ') : name
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

/* ---------- Tags ---------- */

/**
 * A balance between two players as a meter: a bar with the levels marked on it (even, slightly better,
 * better, much better, winning, on each side) and the level in words.
 */
export function BalanceMeter({ k, v }: { k: string; v: number }) {
  const d = defOf(k)
  const at = (x: number) => `${50 + Math.max(-1, Math.min(1, x)) * 50}%`
  const words = balanceText(k, v)
  return (
    <div class="eval-meter" title={describe(k)}>
      <div class="eval-bar-row">
        <span class="bar-end">{d?.ends?.[0] ?? ''}</span>
        <div class="balance-bar" role="meter" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={v} aria-label={`${labelOf(k)}: ${words}`}>
          {BALANCE_LEVELS.flatMap(([x]) => [-x, x]).map((x) => <b key={x} class="tick" style={{ left: at(x) }} />)}
          <i style={{ left: at(v) }} />
        </div>
        <span class="bar-end">{d?.ends?.[1] ?? ''}</span>
      </div>
      <div class="eval-words">{words}</div>
    </div>
  )
}

/** Keys shown in "This joseki" (the tags of the databases (db/<database>/tags.json) `panel: "sequence"`), read from the start of the sequence. */
export const isSequenceKey = (k: string) => defOf(k)?.panel === 'sequence'

/**
 * Tags as rows. Keys described in the tags of the databases (db/<database>/tags.json) are shown their own way (a balance bar, a stone for a color,
 * option icons and colors); any other key is shown as key: value.
 */
export function TagRows({ keys, f, icons, only, hidden = [] }: { keys: string[]; f: Fields; icons: boolean; only?: 'bars' | 'rows'; hidden?: string[] }) {
  const out = keys.filter((k) => !hidden.includes(k) && k !== 'board').flatMap((key) => {
    const r = f.get(key)
    if (!r) return []
    const d = defOf(key)
    const type = typeOf(key, r.value)
    if (type === 'slider') {
      if (only === 'rows' || typeof r.value !== 'number') return []
      const v = r.value
      return [<BalanceMeter key={key} k={key} v={v} />]
    }
    if (only === 'bars') return []
    const icon = icons && d?.icon ? <span class="ico" aria-hidden>{d.icon}</span> : null
    if (type === 'flag') return r.value === true ? [<Row key={key} label={labelOf(key)} title={describe(key)}>{icon}Yes</Row>] : []
    if (type === 'color') {
      const v = String(r.value)
      return [<Row key={key} label={labelOf(key)} title={describe(key)}><span class="value">{v === 'B' || v === 'W' ? <StoneIcon sign={v === 'B' ? 1 : -1} size={14} /> : icon}{valueLabel(key, v)}</span></Row>]
    }
    const vals = type === 'list' || type === 'multi' ? f.list(key) : type === 'number' && d?.unit ? [`${r.value} ${d.unit}`] : asList(r.value)
    const show = (v: string) => {
      const o = d?.options?.find((x) => x.value === v)
      return (
        <span key={v} class="value" title={describe(key, v)}>
          {o?.color && <span class="dot" style={{ background: o.color, borderColor: o.color }} />}
          {icons && o?.icon && !o.color && <span class="ico" aria-hidden>{o.icon}</span>}
          {/^https?:\/\/\S+$/.test(v) ? <a href={v} target="_blank" rel="noopener noreferrer" title={v}>{linkText(v)}</a> : valueLabel(key, v)}
        </span>
      )
    }
    return [<Row key={key} label={labelOf(key)} title={describe(key)}><span class={`values ${d ? '' : 'free-tag'}`}>{icon}{vals.map(show)}</span></Row>]
  })
  return <>{out}</>
}

/** A short text for a link: the page of a Sensei's Library address, else the address without "https://". */
const linkText = (url: string) => {
  const m = url.match(/^https?:\/\/senseis\.xmp\.net\/\?(.+)$/)
  return m ? `Sensei's Library: ${decodeURIComponent(m[1])}` : url.replace(/^https?:\/\//, '')
}

/* ---------- Left: the current position ---------- */

/**
 * Everything about the current position in one panel: its name and the sequence it belongs to (with the
 * sequence's own tags, read from its start), its main move, its tags and its comments.
 */
export function PositionInfo(p: Common & { onOpenLabel: (id: string) => void; onCopyLink?: (id: string) => void }) {
  const { ctx, path } = p
  const step = path[path.length - 1]
  if (!inBook(ctx, step)) return <p class="hint">Not in your databases. Keep playing, or save your line.</p>
  const icons = p.settings.icons
  const hidden = p.settings.hiddenKeys
  const label = primaryLabel(ctx, path)
  const entry = label ? ctx.graph.entries.get(label)! : null
  const at = label ? labelStart(ctx, path, label) : 0
  const ef = label ? entryFields(ctx, label, path[at]) : null
  const crumbs = crumbsOf(ctx, path)
  const others = labelsAt(ctx.graph, step.key, ctx.active).filter((l) => l !== label && ctx.graph.entries.get(l)?.defined)
  const pf = lineFields(ctx, path) // values inherited from earlier positions of the line count too
  const keys = pf.keys().filter((k) => !isSequenceKey(k) && k !== 'main')
  const seqKeys = ef ? ef.keys().filter((k) => isSequenceKey(k) && k !== 'name') : []
  const alias = ef ? ef.list('name').slice(1) : []
  const here = p.messages.filter((m) => m.place === 'position')
  const hasValue = keys.some((k) => k !== 'board' && !hidden.includes(k))
  return (
    <div class="position-info">
      {entry ? (
        <>
          <p class="info-title">
            <span class="db-ul" style={{ textDecorationColor: p.dbColor(entry.contribs[0]?.db ?? '') }} title={`From ${entry.contribs[0]?.db}`}>{p.entryName(label!)}</span>
            {at < path.length - 1 && <span class="info-move"> · move {path.length - 1 - at}</span>}
            {p.onCopyLink && (
              <button class="icon ghost copy-link" onClick={() => p.onCopyLink!(label!)} title="Copy a link that opens this sequence at its first move" aria-label="Copy link to this sequence">
                <Link2 size={14} />
              </button>
            )}
          </p>
          {/* The names along the line; each opens its sequence at its first move, the current one too when you are past it. */}
          {(crumbs.length > 1 || at < path.length - 1) && (
            <div class="crumbs" aria-label="Names along this line">
              {crumbs.map((c, i) => {
                const name = shortAfter(i > 0 ? p.entryName(crumbs[i - 1]) : null, p.entryName(c))
                const here = c === label
                return (
                  <span key={c}>
                    {i > 0 && <span class="sep">›</span>}
                    {here && at === path.length - 1 ? (
                      <b title={p.entryName(c)}>{name}</b>
                    ) : (
                      <button class={`link ${here ? 'cur' : ''}`} title={`${p.entryName(c)}: go to its first move`} onClick={() => p.onOpenLabel(c)}>{name}</button>
                    )}
                  </span>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <p class="hint">This position has no name yet.</p>
      )}
      <TagRows keys={keys} f={pf} icons={icons} only="bars" hidden={hidden} />
      <div class="kvs pos-values">
        {entry && <Row label="Sequence">{entry.id.replace(/\//g, ' › ')}</Row>}
        {alias.length > 0 && !hidden.includes('name') && <Row label="Also called">{alias.join(' · ')}</Row>}
        {ef && <TagRows keys={seqKeys} f={ef} icons={icons} hidden={hidden} />}
        <TagRows keys={keys} f={pf} icons={icons} only="rows" hidden={hidden} />
      </div>
      {/* Comments: each its own block, edged with its database's color. */}
      {here.filter((m) => m.kind === 'pos').map((m, i) => (
        <CommentCard key={m.db + i + plainText(m.segments as never)} db={m.db} color={p.dbColor(m.db)} preview={plainText(m.segments as never)}>
          <Rich segments={m.segments} h={p.refs} />
        </CommentCard>
      ))}
      {!hasValue && !here.length && !entry && <p class="hint">Nothing stored about this position yet.</p>}
      {others.length > 0 && (
        <p class="also">Also part of: {others.map((l) => <button key={l} class="chip" onClick={() => p.onOpenLabel(l)}>{p.entryName(l)}</button>)}</p>
      )}
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
  // Comments: the first database's as the explanation, other databases' (your own notes) as cards with their color.
  const comments = p.messages.filter((m) => m.place === 'move' && m.kind === 'move')
  const why = comments.filter((m) => m.db === ctx.order[0])
  const notes = comments.filter((m) => m.db !== ctx.order[0])
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
          {!comments.length && <p class="hint">No explanation stored for this move.</p>}
          <div class="tags">
            {mf && mf.keys().filter((k) => k !== 'kind' && k !== 'board' && !(s.hiddenKeys ?? []).includes(k)).flatMap((k) => {
              const d = defOf(k)
              const v = mf.get(k)!.value
              if (typeOf(k, v) === 'flag') return v === true ? [<span key={k} class="tag" title={describe(k)}>{s.icons && d?.icon ? <span class="ico" aria-hidden>{d.icon}</span> : null}{labelOf(k)}</span>] : []
              return mf.list(k).map((x) => {
                const o = d?.options?.find((y) => y.value === x)
                // Keys the interface knows show their value; others say which key it is.
                return <span key={k + x} class="tag" title={d?.options ? describe(k, x) : describe(k)}>{s.icons && o?.icon ? <span class="ico" aria-hidden>{o.icon}</span> : null}{d?.options ? valueLabel(k, x) : `${labelOf(k)}: ${valueLabel(k, x)}`}</span>
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
  const main = mainMove(ctx, step)
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
          {main?.edge === c.edge && <span class="main-badge" title="Main move: the line the tree and → follow">main</span>}
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
