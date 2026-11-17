/** Panels of the position-first layout (SPEC §8.1): position info (left), last move and next moves (right). */
import type { ComponentChildren } from 'preact'
import { CATEGORIES, EVAL_LABELS, type Category } from '../core/fields'
import { ptName } from '../core/geometry'
import { labelsAt } from '../core/graph'
import type { Msg } from '../messages'
import type { Settings } from '../settings'
import { candidates, entryFields, labelStart, moveFields, positionFields, primaryLabel, type Candidate, type Ctx, type Resolved, type Step } from '../view'
import { CONDITION_ICONS, IconLabel, PURPOSE_ICONS, SHAPE_ICONS, STATUS_ICONS, STYLE_ICONS } from './icons'
import { Message } from './Message'
import { Rich, type RefHandlers } from './Rich'

export function Row({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="f">
      <div class="fl">{label}</div>
      <div class="fv">{children}</div>
    </div>
  )
}

function Overridden({ r }: { r: Resolved }) {
  if (!r.overridden.length) return null
  return <span class="overridden" title={'Also: ' + r.overridden.map((o) => `${o.value} (${o.db})`).join(', ')}>overridden</span>
}

export function CategoryDot({ cat }: { cat: Category | null }) {
  const k = cat ? CATEGORIES[cat] : null
  return <span class={`dot ${k?.ring ? 'ring' : ''}`} style={{ background: k?.color ?? '#888', borderColor: k?.color ?? '#888' }} aria-hidden />
}

const colorWord = (s: number) => (s === 1 ? 'Black' : s === -1 ? 'White' : 'Either')

function EvalChip({ value }: { value: string }) {
  return <span class={`eval eval-${value.replace(/\+/g, 'p').replace('=', 'eq')}`}>{value}</span>
}

function Balance({ value }: { value: string }) {
  const n = Number(value)
  if (!Number.isFinite(n)) return <span>{value}</span>
  const w = Math.min(50, (Math.abs(n) / 10) * 50)
  return (
    <span class="balance">
      <span class="bar" aria-hidden>
        <span class="mid" />
        <span class="fill" style={{ left: n >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: n >= 0 ? 'var(--stone-b-flat, #151515)' : '#f5f5f2' }} />
      </span>
      {n > 0 ? 'Black +' + n : n < 0 ? 'White +' + -n : 'Even'}
    </span>
  )
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

function msgs(p: Common, place: Msg['place'], onGo?: (n: number) => void) {
  return p.messages
    .filter((m) => m.place === place)
    .map((m, i) => (
      <Message key={place + i} kind={m.kind} title={m.title} db={m.db} dbColor={p.dbColor(m.db)} faded={place === 'history'} onClick={place === 'history' && onGo ? () => onGo(m.step) : undefined}>
        <Rich segments={m.segments} h={p.refs} />
      </Message>
    ))
}

/** Left panel, below the tree: what this position is (labels) and what is known about it. */
export function PositionInfo(p: Common & { onOpenLabel: (id: string) => void }) {
  const { ctx, path, settings: s } = p
  const step = path[path.length - 1]
  const label = primaryLabel(ctx, path)
  const others = labelsAt(ctx.graph, step.key, ctx.active).filter((l) => l !== label)
  const pf = positionFields(ctx, step)
  const icons = s.icons
  if (!ctx.graph.nodes.has(step.key)) {
    return (
      <div class="pos-info">
        <h2>This position</h2>
        <p class="hint">Not in your active databases.</p>
      </div>
    )
  }
  const entry = label ? ctx.graph.entries.get(label)! : null
  const at = label ? labelStart(ctx, path, label) : 0
  const ef = label ? entryFields(ctx, label, path[at]) : null
  const isShape = entry?.type === 'shape'
  const one = (prop: string) => ef?.one(prop) ?? null
  const posSwap = (() => {
    const c = pf.firstWith('XSB') ?? pf.firstWith('XSW')
    return c ? pf.swapped(c) : false
  })()
  const shapeStatus = (prop: 'XSB' | 'XSW') => pf.one(posSwap ? (prop === 'XSB' ? 'XSW' : 'XSB') : prop)
  const resSwap = (() => {
    const c = ef?.firstWith('XRESB') ?? ef?.firstWith('XRESW')
    return c && ef ? ef.swapped(c) : false
  })()
  const shapeRes = (prop: 'XRESB' | 'XRESW') => one(resSwap ? (prop === 'XRESB' ? 'XRESW' : 'XRESB') : prop)

  return (
    <div class="pos-info">
      <h2>This position</h2>
      {entry ? (
        <>
          <div class="entry-name">{p.entryName(entry.id)}</div>
          <p class="hint">{at > 0 ? `Since move ${at} of this line` : 'Label of this line'} · <button class="link" onClick={() => p.onOpenLabel(entry.id)}>start from its first move</button></p>
          {ef!.list('XALIAS').length > 0 && <Row label="Also called">{ef!.list('XALIAS').join(', ')}</Row>}
          {one('XFAM') && <Row label="Family">{one('XFAM')!.value.replace(/\//g, ' › ')}</Row>}
          {one('XDIFF') && <Row label="Difficulty"><span class="rank">{one('XDIFF')!.value}</span></Row>}
          {ef!.list('XERA').length > 0 && <Row label="Era">{ef!.list('XERA').join(', ')}</Row>}
          {ef!.list('XTAG').length > 0 && <Row label="Tags">{ef!.list('XTAG').join(', ')}</Row>}
          {isShape && shapeRes('XRESB') && <Row label="Black first"><IconLabel map={SHAPE_ICONS} value={shapeRes('XRESB')!.value} show={icons} /></Row>}
          {isShape && shapeRes('XRESW') && <Row label="White first"><IconLabel map={SHAPE_ICONS} value={shapeRes('XRESW')!.value} show={icons} /></Row>}
          {isShape && ef!.points('XVITAL').length > 0 && <Row label="Vital point">{ef!.points('XVITAL').map(ptName).join(', ')}</Row>}
          {ef!.text('XSUM').map((t, i) => <p key={i} class="summary"><Rich segments={t.segments} h={p.refs} /></p>)}
          {ef!.list('XSRC').length > 0 && <Row label="Sources">{ef!.list('XSRC').join('; ')}</Row>}
        </>
      ) : (
        <p class="hint">Known position without a name.</p>
      )}
      {others.length > 0 && (
        <p class="also">Also part of: {others.map((l) => <button key={l} class="chip" onClick={() => p.onOpenLabel(l)}>{p.entryName(l)}</button>)}</p>
      )}
      <div class="pos-fields">
        {pf.one('XST') && <Row label="Status"><IconLabel map={STATUS_ICONS} value={pf.one('XST')!.value} show={icons} /></Row>}
        {pf.one('XEV') && <Row label="Evaluation"><EvalChip value={pf.one('XEV')!.value} /> {EVAL_LABELS[pf.one('XEV')!.value] ?? ''} <Overridden r={pf.one('XEV')!} /></Row>}
        {pf.one('XPB') && <Row label="Result"><Balance value={pf.one('XPB')!.value} />{pf.one('XPBS') && <span class="hint"> · {pf.one('XPBS')!.value}</span>}</Row>}
        {pf.one('XSEN') && <Row label="Sente">{colorWord(pf.one('XSEN')!.value === 'B' ? 1 : pf.one('XSEN')!.value === 'W' ? -1 : 0)}</Row>}
        {pf.text('XRES').length > 0 && <Row label="Outcome">{pf.text('XRES').map((t, i) => <div key={i}><Rich segments={t.segments} h={p.refs} /></div>)}</Row>}
        {pf.text('XTEN').length > 0 && <Row label="Tenuki">{pf.text('XTEN').map((t, i) => <div key={i}><Rich segments={t.segments} h={p.refs} /></div>)}</Row>}
        {shapeStatus('XSB') && <Row label="Black next"><IconLabel map={SHAPE_ICONS} value={shapeStatus('XSB')!.value} show={icons} /></Row>}
        {shapeStatus('XSW') && <Row label="White next"><IconLabel map={SHAPE_ICONS} value={shapeStatus('XSW')!.value} show={icons} /></Row>}
        {pf.one('XEYE') && <Row label="Eyes">{pf.one('XEYE')!.value}</Row>}
      </div>
      {msgs(p, 'position')}
    </div>
  )
}

/** Right panel, top: the last move, why it was played, and earlier messages if enabled. */
export function LastMove(p: Common & { onGoTo: (n: number) => void }) {
  const { ctx, path, settings: s } = p
  const step = path[path.length - 1]
  const parent = path.length > 1 ? path[path.length - 2] : null
  const mf = parent && step.edge ? moveFields(ctx, parent, step.edge) : null
  const lastCand: Candidate | undefined = parent && step.edge ? candidates(ctx, parent).find((c) => c.edge === step.edge) : undefined
  const icons = s.icons
  return (
    <div class="last-move">
      {p.messages.some((m) => m.place === 'history') && (
        <>
          <h2>Earlier in this line</h2>
          {msgs(p, 'history', p.onGoTo)}
        </>
      )}
      <h2>Last move</h2>
      {!parent && <p class="hint">Start of the line.</p>}
      {parent && !lastCand && <p class="hint">{step.free && ctx.graph.nodes.has(step.key) ? 'Played freely; the position is known.' : 'Played freely; not in your databases.'}</p>}
      {mf && lastCand && (
        <>
          <div class="lm-head">
            <b>{colorWord(lastCand.sign)} {lastCand.pt ? ptName(lastCand.pt) : 'tenuki'}</b>
            <CategoryDot cat={lastCand.cat} />
            <span class="h-sub">{lastCand.cat ? CATEGORIES[lastCand.cat].label : 'Unclassified'}</span>
          </div>
          <div class="lm-tags">
            {mf.one('XSTY') && <IconLabel map={STYLE_ICONS} value={mf.one('XSTY')!.value} show={icons} />}
            {mf.list('XPUR').map((v) => <IconLabel key={v} map={PURPOSE_ICONS} value={v} show={icons} />)}
            {mf.list('XCOND').map((v) => <IconLabel key={v} map={CONDITION_ICONS} value={v} show={icons} />)}
          </div>
          {msgs(p, 'move')}
        </>
      )}
    </div>
  )
}

/** Right panel, below the last move: how to continue. Moves of both colors get separate tabs. */
export function NextMoves(p: Common & {
  side: 1 | -1
  setSide: (s: 1 | -1) => void
  highlighted: string | null
  onHighlight: (key: string | null) => void
  onPlay: (c: Candidate) => void
  extra?: ComponentChildren
}) {
  const { ctx, path } = p
  const step = path[path.length - 1]
  const all = candidates(ctx, step).filter((c) => !c.cat || !p.settings.hiddenCategories.includes(c.cat))
  const both = all.some((c) => c.sign === 1) && all.some((c) => c.sign === -1)
  const list = both ? all.filter((c) => c.sign === p.side) : all
  const here = primaryLabel(ctx, path)
  const good = list.filter((c) => !c.cat || CATEGORIES[c.cat].good)
  const bad = list.filter((c) => c.cat && !CATEGORIES[c.cat].good)
  const row = (c: Candidate) => {
    const next = primaryLabel(ctx, [...path, c.step])
    return (
      <button
        key={c.step.key + c.sign}
        class={`cand ${p.highlighted === c.step.key ? 'hl' : ''}`}
        onPointerEnter={(e) => e.pointerType === 'mouse' && p.onHighlight(c.step.key)}
        onPointerLeave={() => p.onHighlight(null)}
        onClick={() => p.onPlay(c)}
      >
        <CategoryDot cat={c.cat} />
        <b>{c.pt ? ptName(c.pt) : 'Tenuki'}</b>
        <span class="lbl">
          {c.cat ? CATEGORIES[c.cat].label : 'Unclassified'}
          {c.label ? ` · ${c.label}` : ''}
          {next && next !== here && <span class="to-label"> → {p.entryName(next)}</span>}
        </span>
        <span class="dbs">
          {c.dbs.map((d) => <span key={d} class="db-dot" style={{ background: p.dbColor(d) }} title={d} />)}
        </span>
      </button>
    )
  }
  return (
    <div class="next-moves">
      <div class="nm-head">
        <h2>Next moves</h2>
        {both && (
          <div class="seg side-tabs" role="tablist" aria-label="Side to play">
            <button role="tab" aria-selected={p.side === 1} class={p.side === 1 ? 'on' : ''} onClick={() => p.setSide(1)}>● Black plays</button>
            <button role="tab" aria-selected={p.side === -1} class={p.side === -1 ? 'on' : ''} onClick={() => p.setSide(-1)}>○ White plays</button>
          </div>
        )}
      </div>
      {list.length === 0 && <p class="hint">{ctx.graph.nodes.has(step.key) ? 'No stored continuation.' : 'Not in your databases.'}</p>}
      {good.length > 0 && <div class="cands">{good.map(row)}</div>}
      {bad.length > 0 && (
        <>
          <div class="fam">Mistakes and traps</div>
          <div class="cands">{bad.map(row)}</div>
        </>
      )}
      {p.extra}
    </div>
  )
}
