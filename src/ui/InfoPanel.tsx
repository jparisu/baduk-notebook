/** Right-hand panel: entry, last move, position and next moves (SPEC §8.7). */
import type { ComponentChildren } from 'preact'
import { CATEGORIES, EVAL_LABELS, SHAPE_STATUS_LABELS, type Category } from '../core/fields'
import { ptName } from '../core/geometry'
import type { Msg } from '../messages'
import type { Settings } from '../settings'
import { candidates, entryFields, moveFields, positionFields, toMove, type Candidate, type Ctx, type Resolved, type Step } from '../view'
import { CONDITION_ICONS, IconLabel, PURPOSE_ICONS, SHAPE_ICONS, STATUS_ICONS, STYLE_ICONS } from './icons'
import { Message } from './Message'
import { Rich, type RefHandlers } from './Rich'

interface Props {
  ctx: Ctx
  entryId: string
  path: Step[]
  settings: Settings
  messages: Msg[]
  refs: RefHandlers
  dbColor: (db: string) => string
  highlighted: string | null
  onHighlight: (key: string | null) => void
  onGo: (path: Step[]) => void
}

function Row({ label, children }: { label: string; children: ComponentChildren }) {
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
        <span class="fill" style={{ left: n >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: n >= 0 ? 'var(--stone-black)' : 'var(--stone-white)' }} />
      </span>
      {n > 0 ? '+' : ''}{n} (Black's view)
    </span>
  )
}

export function InfoPanel(p: Props) {
  const { ctx, path, settings: s } = p
  const step = path[path.length - 1]
  const parent = path.length > 1 ? path[path.length - 2] : null
  const entry = ctx.graph.entries.get(p.entryId)!
  const ef = entryFields(ctx, p.entryId, path[0])
  const pf = positionFields(ctx, step)
  const isJ = entry.type === 'joseki'
  const icons = s.icons
  const name = ef.one('XNAME')?.value ?? entry.id
  const entryDb = entry.contribs.find((c) => ctx.active.has(c.db))?.db ?? entry.contribs[0].db

  const msgs = (place: Msg['place']) =>
    p.messages
      .filter((m) => m.place === place)
      .map((m, i) => (
        <Message key={place + i} kind={m.kind} title={m.title} db={m.db} dbColor={p.dbColor(m.db)} faded={place === 'history'} onClick={place === 'history' ? () => p.onGo(path.slice(0, m.step + 1)) : undefined}>
          <Rich segments={m.segments} h={p.refs} />
        </Message>
      ))

  const text = (prop: string) =>
    ef.text(prop).map((t, i) => (
      <div key={prop + i}>
        <Rich segments={t.segments} h={p.refs} />
      </div>
    ))

  // Shapes: "if Black/White plays first" follow the display's color swap.
  const resSwap = (() => {
    const c = ef.firstWith('XRESB') ?? ef.firstWith('XRESW')
    return c ? ef.swapped(c) : false
  })()
  const shapeRes = (prop: 'XRESB' | 'XRESW') => ef.one(resSwap ? (prop === 'XRESB' ? 'XRESW' : 'XRESB') : prop)
  const posSwap = (() => {
    const c = pf.firstWith('XSB') ?? pf.firstWith('XSW')
    return c ? pf.swapped(c) : false
  })()
  const shapeStatus = (prop: 'XSB' | 'XSW') => pf.one(posSwap ? (prop === 'XSB' ? 'XSW' : 'XSB') : prop)

  const cands = candidates(ctx, step)
  const mf = parent && step.edge ? moveFields(ctx, parent, step.edge) : null
  const lastCand: Candidate | undefined = parent ? candidates(ctx, parent).find((c) => c.edge === step.edge) : undefined
  const one = (f: typeof pf, prop: string) => f.one(prop)

  return (
    <div>
      <h3>
        {isJ ? 'Joseki' : 'Shape'}
        <span class="badge" style={{ borderColor: p.dbColor(entryDb), color: p.dbColor(entryDb) }}>{entryDb}</span>
      </h3>
      <div class="entry-name">{name}</div>
      {isJ ? (
        <>
          {ef.list('XALIAS').length > 0 && <Row label="Also called">{ef.list('XALIAS').join(', ')}</Row>}
          {one(ef, 'XFAM') && <Row label="Family">{one(ef, 'XFAM')!.value.replace(/\//g, ' › ')}</Row>}
          {one(ef, 'XDIFF') && <Row label="Difficulty"><span class="rank">{one(ef, 'XDIFF')!.value}</span></Row>}
          {ef.list('XERA').length > 0 && <Row label="Era">{ef.list('XERA').join(', ')}</Row>}
          {one(ef, 'XSTART') && <Row label="Start">{one(ef, 'XSTART')!.value === 'setup' ? 'Set-up position' : 'Empty corner'}</Row>}
          {ef.list('XTAG').length > 0 && <Row label="Tags">{ef.list('XTAG').join(', ')}</Row>}
        </>
      ) : (
        <>
          {one(ef, 'XSIZE') && <Row label="Eye space">{one(ef, 'XSIZE')!.value} points</Row>}
          {one(ef, 'XLOC') && <Row label="Location">{one(ef, 'XLOC')!.value}</Row>}
          {one(ef, 'XSURR') && <Row label="Surroundings">{one(ef, 'XSURR')!.value}{one(ef, 'XOLIB') ? `, ${one(ef, 'XOLIB')!.value} outside liberties` : ''}</Row>}
          {one(ef, 'XARR') && <Row label="Arrangement">{one(ef, 'XARR')!.value}</Row>}
          {shapeRes('XRESB') && <Row label="Black first"><IconLabel map={SHAPE_ICONS} value={shapeRes('XRESB')!.value} show={icons} /></Row>}
          {shapeRes('XRESW') && <Row label="White first"><IconLabel map={SHAPE_ICONS} value={shapeRes('XRESW')!.value} show={icons} /></Row>}
          {ef.points('XVITAL').length > 0 && <Row label="Vital point">{ef.points('XVITAL').map(ptName).join(', ')}</Row>}
          {one(ef, 'XKOT') && <Row label="Ko type">{one(ef, 'XKOT')!.value}</Row>}
          {one(ef, 'XDIFF') && <Row label="Difficulty"><span class="rank">{one(ef, 'XDIFF')!.value}</span></Row>}
        </>
      )}
      {ef.text('XSUM').length > 0 && <Row label="Summary">{text('XSUM')}</Row>}
      {ef.text('XRULE').length > 0 && <Row label="Rules">{text('XRULE')}</Row>}
      {ef.list('XSRC').length > 0 && <Row label="Sources">{ef.list('XSRC').join('; ')}</Row>}

      {p.messages.some((m) => m.place === 'history') && (
        <>
          <h3>Earlier in this line</h3>
          {msgs('history')}
        </>
      )}

      {mf && lastCand && (
        <>
          <h3>
            Last move: {colorWord(lastCand.sign)} {lastCand.pt ? ptName(lastCand.pt) : 'tenuki'}
            <CategoryDot cat={lastCand.cat} />
            <span class="h-sub">{lastCand.cat ? CATEGORIES[lastCand.cat].label : ''}</span>
          </h3>
          {mf.one('XSTY') && <Row label="Style"><IconLabel map={STYLE_ICONS} value={mf.one('XSTY')!.value} show={icons} /> <Overridden r={mf.one('XSTY')!} /></Row>}
          {mf.list('XPUR').length > 0 && (
            <Row label="Purpose">
              <span class="icon-list">{mf.list('XPUR').map((v) => <IconLabel key={v} map={PURPOSE_ICONS} value={v} show={icons} />)}</span>
            </Row>
          )}
          {mf.list('XCOND').length > 0 && (
            <Row label="Conditions">
              <span class="icon-list">{mf.list('XCOND').map((v) => <IconLabel key={v} map={CONDITION_ICONS} value={v} show={icons} />)}</span>
            </Row>
          )}
          {s.moveMessage === 'board' && mf.text('XMW').length > 0 && <p class="hint">Why this move: shown under the board.</p>}
          {msgs('move')}
        </>
      )}

      <h3>Position · {colorWord(toMove(ctx, step))} to play</h3>
      {isJ ? (
        <>
          {pf.one('XST') && <Row label="Status"><IconLabel map={STATUS_ICONS} value={pf.one('XST')!.value} show={icons} /></Row>}
          {pf.one('XEV') && <Row label="Evaluation"><EvalChip value={pf.one('XEV')!.value} /> {EVAL_LABELS[pf.one('XEV')!.value] ?? ''} <Overridden r={pf.one('XEV')!} /></Row>}
          {pf.one('XPB') && <Row label="Point balance"><Balance value={pf.one('XPB')!.value} />{pf.one('XPBS') && <span class="hint"> · {pf.one('XPBS')!.value}</span>}</Row>}
          {pf.one('XSEN') && <Row label="Sente">{colorWord(pf.one('XSEN')!.value === 'B' ? 1 : pf.one('XSEN')!.value === 'W' ? -1 : 0)}</Row>}
          {pf.text('XRES').length > 0 && <Row label="Result">{pf.text('XRES').map((t, i) => <div key={i}><Rich segments={t.segments} h={p.refs} /></div>)}</Row>}
          {pf.text('XTEN').length > 0 && <Row label="Tenuki">{pf.text('XTEN').map((t, i) => <div key={i}><Rich segments={t.segments} h={p.refs} /></div>)}</Row>}
        </>
      ) : (
        <>
          {shapeStatus('XSB') && <Row label="Black next"><IconLabel map={SHAPE_ICONS} value={shapeStatus('XSB')!.value} show={icons} /></Row>}
          {shapeStatus('XSW') && <Row label="White next"><IconLabel map={SHAPE_ICONS} value={shapeStatus('XSW')!.value} show={icons} /></Row>}
          {pf.one('XEYE') && <Row label="Eyes">{pf.one('XEYE')!.value}</Row>}
          {pf.one('XLIB') && <Row label="Liberties">{pf.one('XLIB')!.value}</Row>}
        </>
      )}
      {msgs('position')}

      <h3>Next moves ({cands.length})</h3>
      <div class="cands">
        {cands.length === 0 && <p class="hint">End of this line.</p>}
        {cands.map((c) => (
          <button
            key={c.step.key}
            class={`cand ${p.highlighted === c.step.key ? 'hl' : ''}`}
            onMouseEnter={() => p.onHighlight(c.step.key)}
            onMouseLeave={() => p.onHighlight(null)}
            onClick={() => p.onGo([...path, c.step])}
          >
            <CategoryDot cat={c.cat} />
            <b>{toMove(ctx, step) === 0 ? (c.sign === 1 ? 'B ' : 'W ') : ''}{c.pt ? ptName(c.pt) : 'Tenuki'}</b>
            <span class="lbl">{c.cat ? CATEGORIES[c.cat].label : 'Unclassified'}{c.label ? ` · ${c.label}` : ''}</span>
            <span class="dbs">
              {c.dbs.map((d) => (
                <span key={d} class="badge" style={{ borderColor: p.dbColor(d), color: p.dbColor(d) }}>{d}</span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export const shapeStatusLabel = (v: string) => SHAPE_STATUS_LABELS[v] ?? v
