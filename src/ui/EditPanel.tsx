/**
 * Edit panel (docs/MODEL.md §8), in two tabs:
 * - Position: its comments, its tags, the order of its next moves (the first is the main move) and its name;
 * - Move into it: the move from the previous position of your line, with its kind, comments and tags.
 *   The same position can be reached by other moves, so the move's data is stored apart, on that move.
 * Each part is a box, and each tag a row of its own. Edits go into the target database; values that
 * other databases store are shown with their database, and can be changed there.
 * Writing anything on a move played freely saves the line up to it.
 */
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import {
  BALANCE_LEVELS, NEW_KEY_TYPES, asList, balanceText, asText, defOf, describe, getRegistry, isListType, labelOf, sortKeys, swapKeyOf, swapValue, swapsValue, toValue, typeOf, valueLabel,
  type TagDef, type TagType, type TagValue,
} from '../core/tags'
import { CATEGORIES } from '../core/kinds'
import { RANK } from '../core/validate'
import { apply, compose, ptName } from '../core/geometry'
import { locate, nameSequence, renameTag, setComments, setTags, type Location, type On } from '../edit/ops'
import { updateRegistry } from '../edit/workspace'
import { FREE_LABELS, isStartId, seqOf } from '../core/model'
import type { Workspace } from '../edit/workspace'
import { Fields, candidates, entryFields, frame, inBook, isInherited, lineFields, moveOf, node, primaryLabel, rootStep, type Ctx, type Step } from '../view'
import { MoveMark } from './Panels'
import { Rich } from './Rich'

export type EditTab = 'pos' | 'move'

export interface EditApi {
  ws: Workspace
  ctx: Ctx
  path: Step[]
  target: string
  commit: (msg?: string) => void
  onFocusText: (el: HTMLTextAreaElement) => void
  onDeleteMove: () => void
  /** Sets the order of the next moves (the first is the main move). */
  onOrder: (children: Step[]) => void
  /** Switches the database that receives the edits (to change a value another database stores). */
  onTarget: (db: string) => void
  /** The tab shown; the app keeps it so menus can open one. */
  tab: EditTab
  onTab: (t: EditTab) => void
}

/** Keys edited in their own place, not in the tag list. */
const OWN_PLACE = new Set(['name'])

/** A box with a title: one part of the editor. */
function Box({ title, info, children, class: cls }: { title: string; info?: string; children: ComponentChildren; class?: string }) {
  return (
    <section class={`edit-box ${cls ?? ''}`} aria-label={title}>
      <h3 class="edit-box-h">{title}{info && <Info text={info} />}</h3>
      {children}
    </section>
  )
}

/** Help that stays out of the way: an (i) that shows its text on hover or focus. */
export function Info({ text }: { text: string }) {
  return <span class="info-i" tabIndex={0} role="img" aria-label={text} title={text}>i</span>
}

export function EditPanel(p: EditApi) {
  const { ctx, path } = p
  /** Keys added that have no value yet, per record, with their type. */
  const [added, setAdded] = useState<Record<On, Record<string, TagType>>>({ pos: {}, move: {} })
  const step = path[path.length - 1]
  const prev = path.length > 1 ? path[path.length - 2] : null
  const F = frame(ctx, step)
  const label = primaryLabel(ctx, path)

  const where = (create: boolean): Location | null => locate(p.ws, ctx, path, p.target, label, create)
  const swapped = (loc: Location) => compose(F, loc.T).swap
  const recOf = (loc: Location | null, on: On) => (loc ? (on === 'move' ? loc.move : loc.pos) : null)

  /** This database's value of a key, as the display sees it (Swap colors trades "black-first" and "white-first"). */
  const read = (on: On, key: string): TagValue | undefined => {
    const loc = where(false)
    const r = recOf(loc, on)
    if (!r || !loc) return undefined
    const sw = swapped(loc)
    const real = sw ? swapKeyOf(key) : key
    const v = r.tags[real]
    return v !== undefined && sw && swapsValue(real) ? swapValue(real, v) : v
  }
  const write = (on: On, key: string, value: TagValue | null, msg?: string) => {
    const loc = where(true)!
    const sw = swapped(loc)
    const real = sw ? swapKeyOf(key) : key
    setTags(p.ws, loc, on, { [real]: value !== null && sw && swapsValue(real) ? swapValue(real, value) : value })
    if (value === null) setAdded((a) => ({ ...a, [on]: Object.fromEntries(Object.entries(a[on]).filter(([k]) => k !== key)) }))
    p.commit(msg)
  }

  /**
   * Removes a tag: this database's value; when only other databases have it, from those databases
   * (their value would otherwise stay on screen with no way to remove it here).
   */
  const removeTag = (on: On, key: string, own: boolean) => {
    const drop = () => setAdded((a) => ({ ...a, [on]: Object.fromEntries(Object.entries(a[on]).filter(([k]) => k !== key)) }))
    if (own) return write(on, key, null, `${labelOf(key)} removed`)
    if (!others(on).get(key)) return drop() // added, no value yet
    const dbs = [...new Set(contribsOf(on).filter((c) => c.db !== p.target && ctx.active.has(c.db)).map((c) => c.db))]
    const done: string[] = []
    for (const db of dbs) {
      const loc = locate(p.ws, ctx, path, db, label, false)
      const r = loc ? recOf(loc, on) : null
      if (!loc || !r) continue
      const real = swapped(loc) ? swapKeyOf(key) : key
      if (r.tags[real] === undefined) continue
      setTags(p.ws, loc, on, { [real]: null })
      done.push(db)
    }
    p.commit(done.length ? `${labelOf(key)} removed from ${done.join(', ')}` : undefined)
  }

  /** What other databases store on this position or move (as the display sees it). */
  const contribsOf = (on: On) => (on === 'move' ? step.edge?.contribs ?? [] : ctx.graph.nodes.get(step.key)?.contribs ?? [])
  const others = (on: On) =>
    on === 'move'
      ? new Fields(ctx, contribsOf('move').filter((c) => c.db !== p.target), prev ? frame(ctx, prev) : F, 'om', step.edge?.sign ?? null)
      : new Fields(ctx, contribsOf('pos').filter((c) => c.db !== p.target), F, 'op', node(ctx, step).toMove)

  /** A value inherited from an earlier position of the line. */
  const lf = lineFields(ctx, path)
  const inherited = (key: string): { value: TagValue; from: number } | null => {
    if (!isInherited(key) || read('pos', key) !== undefined) return null
    const i = lf.source(key)
    if (i === null || i === path.length - 1) return null
    const r = lf.get(key)
    return r ? { value: r.value, from: i } : null
  }
  const fromText = (i: number) => (i === 0 ? 'the start' : `move ${i}`)

  /** One tag: its name (hover for its meaning), its control, where the value comes from, and ×. */
  const tagRow = (on: On, key: string) => {
    const id = `f-${on}-${key}`
    const own = read(on, key)
    const other = own === undefined ? others(on).get(key) : null
    const inh = own === undefined && !other && on === 'pos' ? inherited(key) : null
    const v = own ?? other?.value ?? inh?.value
    const d = defOf(key)
    const type = v === undefined && added[on][key] ? added[on][key] : typeOf(key, v)
    const set = (raw: string | string[] | number | boolean | null, msg?: string) => write(on, key, toValue(key, raw, type), msg)
    const opts = d?.options ?? []
    const from = own !== undefined ? null : other ? 'other' : inh ? 'inherited' : null
    let control
    switch (type) {
      case 'choice':
        control = d?.control === 'buttons' ? (
          <div class="cat-buttons" role="group" aria-label={labelOf(key)}>
            {opts.map((o, i) => (
              <button
                key={o.value}
                class={`cat-btn ${v === o.value ? 'on' : ''} ${v === o.value && from ? 'from-other' : ''}`}
                style={{ '--cat': o.color ?? 'var(--accent)' } as never}
                aria-pressed={v === o.value}
                title={`${describe(key, o.value)}${key === 'kind' ? ` (key ${i + 1})` : ''}`}
                onClick={() => set(own === o.value ? null : o.value, own === o.value ? `${labelOf(key)}: removed` : `Saved as ${o.label.toLowerCase()} in ${p.target}`)}
              >
                {o.color ? <span class={`dot ${o.ring ? 'ring' : ''}`} style={{ background: o.color, borderColor: o.color }} /> : o.icon && <span aria-hidden>{o.icon}</span>}
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <select id={id} value={asText(v)} title={v !== undefined ? describe(key, asText(v)) : describe(key)} onChange={(e) => set((e.target as HTMLSelectElement).value || null)}>
            <option value="">—</option>
            {opts.map((o) => <option key={o.value} value={o.value} title={describe(key, o.value)}>{o.icon ? o.icon + ' ' : ''}{o.label}</option>)}
          </select>
        )
        break
      case 'multi': {
        const cur = asList(v)
        control = (
          <span class="chips">
            {opts.map((o) => (
              <button key={o.value} class={`chip ${cur.includes(o.value) ? 'on' : ''}`} aria-pressed={cur.includes(o.value)} title={describe(key, o.value)} onClick={() => set(cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value])}>{o.icon ? o.icon + ' ' : ''}{o.label}</button>
            ))}
          </span>
        )
        break
      }
      case 'slider':
        control = (
          <span class="slider-col">
          <span class="slider-row">
            <span class="bar-end">{d?.ends?.[0] ?? ''}</span>
            <input id={id} type="range" min="-1" max="1" step="0.05" list="balance-levels" class={v === undefined ? 'unset' : ''} value={typeof v === 'number' ? v : 0} aria-label={labelOf(key)} onInput={(e) => { const w = e.currentTarget.parentElement?.nextElementSibling; if (w) w.textContent = balanceText(key, Number(e.currentTarget.value)) }} onChange={(e) => set(Number((e.target as HTMLInputElement).value))} />
            <span class="bar-end">{d?.ends?.[1] ?? ''}</span>
            <datalist id="balance-levels">{[0, ...BALANCE_LEVELS.flatMap(([x]) => [-x, x])].map((x) => <option key={x} value={x} />)}</datalist>
          </span>
          <span class="eval-words">{typeof v === 'number' ? balanceText(key, v) : 'Not set'}</span>
          </span>
        )
        break
      case 'flag':
        control = <label class="flag-f"><input id={id} type="checkbox" checked={v === true} onChange={(e) => set((e.target as HTMLInputElement).checked)} /> {d?.icon} Yes</label>
        break
      case 'color':
        control = (
          <span class="seg" role="group" aria-label={labelOf(key)}>
            {([['B', 'Black'], ['W', 'White'], ['none', 'Neither']] as const).map(([c, l]) => (
              <button key={c} class={v === c ? 'on' : ''} aria-pressed={v === c} onClick={() => set(own === c ? null : c)}>{l}</button>
            ))}
          </span>
        )
        break
      case 'board':
        control = <textarea id={id} rows={2} defaultValue={asList(v).join('\n')} placeholder="One shape per line: TR:Q16, AR:Q16-R14, LB:Q16=A" onBlur={(e) => e.currentTarget.value !== asList(v).join('\n') && set(e.currentTarget.value.split('\n'))} />
        break
      default: {
        const text = isListType(type) ? asList(v).join(', ') : v === undefined ? '' : String(v)
        const bad = type === 'rank' && text && !RANK.test(text)
        control = (
          <input
            id={id}
            type={type === 'number' ? 'number' : 'text'}
            step="any"
            defaultValue={text}
            class={bad ? 'invalid' : ''}
            placeholder={type === 'list' ? 'comma separated' : type === 'rank' ? 'e.g. 15k, 2d' : d?.hint}
            onBlur={(e) => e.currentTarget.value !== text && set(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        )
      }
    }
    return (
      <div class={`tag-row ${from ? 'from-' + from : ''} ${d ? '' : 'free-key'}`} key={id + JSON.stringify(v ?? null) + p.target}>
        <div class="tag-row-head">
          <label class="tag-name" for={id} title={describe(key)}>{labelOf(key)}</label>
          {from === 'other' && (
            <button class="src-badge" onClick={() => p.onTarget(other!.db)} title={`Stored in ${other!.db}. Changing it here stores your own value in ${p.target}; click to edit into ${other!.db} instead.`}>{other!.db}</button>
          )}
          {from === 'inherited' && <span class="src-badge" title="Inherited from an earlier position of the line; setting it here changes it from this move on">{fromText(inh!.from)}</span>}
          <span class="spacer" />
          {(own !== undefined || from === 'other' || (v === undefined && key in added[on])) && (
            <button class="icon ghost tag-x" title={own !== undefined || from !== 'other' ? `Remove ${labelOf(key)}` : `Remove ${labelOf(key)} from ${other!.db}`} aria-label={`Remove ${labelOf(key)}`} onClick={() => removeTag(on, key, own !== undefined)}>×</button>
          )}
        </div>
        <div class="tag-control">{control}</div>
      </div>
    )
  }

  /** Every key this record shows: its own, the ones other databases set here, inherited ones and the ones just added. */
  const keysOf = (on: On): string[] => {
    const loc = where(false)
    const own = Object.keys(recOf(loc, on)?.tags ?? {}).map((k) => (loc && swapped(loc) ? swapKeyOf(k) : k))
    const inh = on === 'pos' ? lf.keys().filter((k) => inherited(k)) : []
    // Keys db/tags.json always offers (the kind buttons of a move).
    const suggested = getRegistry().tags.filter((d) => d.suggest && (!d.for || (d.for === 'move') === (on === 'move'))).map((d) => d.key)
    return sortKeys([...own, ...suggested, ...others(on).keys(), ...inh, ...Object.keys(added[on])]).filter((k) => !OWN_PLACE.has(k))
  }

  /** Comments: other databases' (read only, with a way to edit them there), then this database's, one box each. */
  const comments = (on: On) => {
    const own = recOf(where(false), on)?.comments ?? []
    const firstId = `f-${on}-comment`
    const save = (list: string[]) => {
      setComments(p.ws, where(true)!, on, list)
      p.commit()
    }
    const theirs = others(on).comments()
    return (
      <div class="comments-edit" key={on + own.join('\u0001') + p.target}>
        {theirs.map((t, i) => (
          <div class="comment-item from-other" key={'o' + i}>
            <div class="tag-row-head"><button class="src-badge" onClick={() => p.onTarget(t.db)} title={`Stored in ${t.db}; click to edit into ${t.db}`}>{t.db}</button></div>
            <div class="comment-ro"><Rich segments={t.segments} h={{ hovered: null, pinned: null, colors: null, onHover: () => {}, onPin: () => {} }} /></div>
          </div>
        ))}
        {own.map((t, i) => (
          <div class="comment-item" key={i}>
            <textarea id={i === 0 ? firstId : `${firstId}-${i}`} defaultValue={t} onFocus={(e) => p.onFocusText(e.currentTarget)} onBlur={(e) => e.currentTarget.value !== t && save(own.map((x, j) => (j === i ? e.currentTarget.value : x)))} />
            <button class="icon ghost" title="Remove this comment" aria-label="Remove this comment" onClick={() => save(own.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <div class="comment-item new">
          <textarea id={own.length ? `${firstId}-new` : firstId} placeholder={own.length ? 'Add another comment…' : 'Add a comment…'} onFocus={(e) => p.onFocusText(e.currentTarget)} onBlur={(e) => e.currentTarget.value.trim() && save([...own, e.currentTarget.value])} />
        </div>
      </div>
    )
  }

  const addTag = (on: On, exclude: string[]) => (
    <AddTag
      on={on}
      exclude={new Set([...exclude, ...OWN_PLACE])}
      used={usedKeys(p.ws)}
      onAdd={(key, type, def) => {
        if (def) updateRegistry(p.ws, { tags: [...getRegistry().tags, def] })
        // Yes/no tags are set at once; the others get their row and the cursor.
        if (type === 'flag') return write(on, key, true, `${labelOf(key)} set`)
        setAdded((a) => ({ ...a, [on]: { ...a[on], [key]: type } }))
        if (def) p.commit(`New tag "${def.label}" described in db/tags.json (saved in this browser; Export proposes it)`)
        setTimeout(() => (document.getElementById(`f-${on}-${key}`) as HTMLElement | null)?.focus(), 30)
      }}
      onRename={(from, to) => {
        renameTag(p.ws, where(true)!, on, from, to)
        p.commit(`Renamed ${from} to ${to}`)
      }}
      own={Object.keys(recOf(where(false), on)?.tags ?? {}).filter((k) => !defOf(k))}
    />
  )

  const targetOwnsMove = step.edge?.contribs.some((c) => c.db === p.target)
  const here = where(false)
  const definesHere = !!here && isStartId(here.pos.id)
  // The sequence the position belongs to: its own, else the last named one on the line (where it comes from).
  const fromLabel = (() => {
    for (let i = path.length; i > 0; i--) {
      const l = primaryLabel(ctx, path.slice(0, i))
      if (l) return l
    }
    return null
  })()
  const curSeq = here ? seqOf(here.pos.id) : fromLabel ?? 'joseki'
  const rename = (seq: string) => {
    const err = nameSequence(p.ws, ctx, path, p.target, seq, null)
    if (err) return p.commit(err)
    p.commit(`This sequence is now ${seq}`)
  }
  const names = asList(read('pos', 'name'))
  // A new sequence's name: the position's move number by default (with a letter when that is taken).
  let defaultName = String(path.length - 1)
  for (let i = 1; ctx.graph.entries.has(`${curSeq}/${defaultName}`); i++) defaultName = `${path.length - 1}${String.fromCharCode(97 + i)}`
  const knownParts = [...new Set([...ctx.graph.entries.keys()].flatMap((id) => id.split('/')))].sort()
  const next = candidates(ctx, step)
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= next.length) return
    const order = next.map((c) => c.step)
    ;[order[i], order[j]] = [order[j], order[i]]
    p.onOrder(order)
  }
  // The move into this position, from the previous position of your line.
  const m = moveOf(step)
  const moveName = prev && m ? `${(frame(ctx, prev).swap ? -m.sign : m.sign) === 1 ? 'Black' : 'White'} ${m.pt ? ptName(apply(frame(ctx, prev), m.pt)) : 'tenuki'}` : ''
  const prevLabel = prev ? primaryLabel(ctx, path.slice(0, -1)) : null
  const prevName = prevLabel ? entryFields(ctx, prevLabel, rootStep(ctx, prevLabel)).text('name') || seqOf(prevLabel).split('/').pop() : null
  const tab = prev ? p.tab : 'pos'
  const moveKeys = keysOf('move')
  const posKeys = keysOf('pos')

  return (
    <div class="edit-panel">
      <div class="seg edit-tabs" role="tablist" aria-label="What to edit">
        <button role="tab" aria-selected={tab === 'pos'} class={tab === 'pos' ? 'on' : ''} onClick={() => p.onTab('pos')}>Position</button>
        <button role="tab" aria-selected={tab === 'move'} class={tab === 'move' ? 'on' : ''} disabled={!prev} onClick={() => p.onTab('move')} title={prev ? `${moveName}, from the previous position of your line. Other moves can reach this position too; each keeps its own kind, comments and tags.` : 'The start of the line has no move into it'}>Move into it{moveName ? ` · ${moveName}` : ''}</button>
      </div>

      {tab === 'pos' && (
        <>
          <Box title="Comments" info="What this position means: the result, what tenuki gives, what to watch out for. {{Player}} = who plays next, {{Opponent}} = the other; {{TR:Q16|words}} points at the board.">{comments('pos')}</Box>
          <Box title="Tags">
            <div class="tag-list">{posKeys.map((k) => tagRow('pos', k))}</div>
            {addTag('pos', posKeys)}
          </Box>
          {next.length > 0 && (
            <Box title="Next moves" info="The first is the main move: the one the tree and → follow. The arrows reorder them.">
              <ol class="order-list">
                {next.map((c, i) => (
                  <li key={c.step.key} class="order-row">
                    <MoveMark cat={c.cat} />
                    <b>{c.pt ? ptName(c.pt) : 'Tenuki'}</b>
                    {i === 0 && <span class="main-badge">main</span>}
                    <span class="what" title={c.cat ? describe('kind', c.cat) : ''}>{c.cat ? CATEGORIES[c.cat].label : 'Unclassified'}{c.label ? ` · ${c.label}` : ''}</span>
                    <span class="spacer" />
                    <button class="icon ghost" aria-label={`Move ${c.pt ? ptName(c.pt) : 'tenuki'} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button class="icon ghost" aria-label={`Move ${c.pt ? ptName(c.pt) : 'tenuki'} down`} disabled={i === next.length - 1} onClick={() => move(i, 1)}>↓</button>
                  </li>
                ))}
              </ol>
            </Box>
          )}
          <Box title="Name">
            {definesHere ? (
              <>
                <label class="tag-row" key={'name' + names.join('|')}>
                  <span class="tag-name" title="The first is the title; the others are other names (comma separated)">Names</span>
                  <input id="f-pos-name" type="text" defaultValue={names.join(', ')} onBlur={(e) => e.currentTarget.value !== names.join(', ') && write('pos', 'name', toValue('name', e.currentTarget.value, 'list'))} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                </label>
                <SequenceEditor
                  key={'seq' + here!.pos.id}
                  parents={seqOf(here!.pos.id).split('/').slice(0, -1)}
                  name={seqOf(here!.pos.id).split('/').pop()!}
                  known={knownParts}
                  action="Save"
                  submit={(seq) => seq !== here!.pos.id && rename(seq)}
                />
                <label class="tag-row">
                  <span class="tag-name">Placement</span>
                  <select id="f-free" value={here!.pos.free} onChange={(e) => {
                    here!.pos.free = (e.target as HTMLSelectElement).value as typeof here.pos.free
                    setTags(p.ws, here!, 'pos', {})
                    p.commit()
                  }}>
                    {FREE_LABELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </>
            ) : (
              <SequenceEditor
                key={'new' + step.key + curSeq}
                parents={curSeq.split('/')}
                name={defaultName}
                known={knownParts}
                action="Name this position"
                submit={(seq) => {
                  const name = seq.split('/').pop()!
                  const err = nameSequence(p.ws, ctx, path, p.target, seq, name)
                  p.commit(err ?? `Named this position "${name}"`)
                }}
              />
            )}
          </Box>
        </>
      )}

      {tab === 'move' && prev && (
        <>
          <p class="move-in-head"><b>{moveName}</b>{prevName ? <> · from {prevName}</> : null}</p>
          {inBook(ctx, prev) ? (
            <>
              <Box title="Comments" info="Why this move is good or bad. {{Player}} = who played it, {{Opponent}} = the other.">{comments('move')}</Box>
              <Box title="Tags">
                <div class="tag-list">{moveKeys.map((k) => tagRow('move', k))}</div>
                {addTag('move', moveKeys)}
              </Box>
              {targetOwnsMove && <button class="danger" onClick={p.onDeleteMove}>Delete this move and what follows from {p.target}</button>}
            </>
          ) : (
            <p class="hint">Store the previous position first.</p>
          )}
        </>
      )}
    </div>
  )
}

/**
 * A sequence id as its parts: the parent sequences (chips: remove any, add any) and its own name.
 * Stored joined with "/", e.g. joseki/4-4 point/3-3 invasion/5.
 */
function SequenceEditor({ parents: initial, name: initialName, known, action, submit }: {
  parents: string[]
  name: string
  known: string[]
  action: string
  submit: (seq: string) => void
}) {
  const [parents, setParents] = useState(initial.filter(Boolean))
  const [name, setName] = useState(initialName)
  const [adding, setAdding] = useState('')
  const clean = (x: string) => x.replace(/[/:]/g, ' ').replace(/\s+/g, ' ').trim()
  const addParent = () => {
    const x = clean(adding)
    if (x) setParents([...parents, x])
    setAdding('')
  }
  const seq = [...parents, clean(name)].filter(Boolean).join('/')
  return (
    <form class="seq-edit" onSubmit={(e) => {
      e.preventDefault()
      if (clean(name)) submit(seq)
    }}>
      <div class="tag-row">
        <span class="tag-name" title="The sequences this one is part of, from the widest">Parents</span>
        <div class="parent-chips">
          {parents.map((x, i) => (
            <span key={i + x} class="parent-chip">
              {i > 0 && <span class="sep">›</span>}
              <span class="chip">{x}<button type="button" class="chip-x" aria-label={`Remove parent ${x}`} onClick={() => setParents(parents.filter((_, j) => j !== i))}>×</button></span>
            </span>
          ))}
          <input class="parent-add" list="seq-parts" value={adding} placeholder="+ parent" aria-label="Add a parent"
            onInput={(e) => setAdding((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addParent() } }}
            onBlur={addParent} />
          <datalist id="seq-parts">{known.map((x) => <option key={x} value={x} />)}</datalist>
        </div>
      </div>
      <div class="tag-row">
        <label class="tag-name" for="f-name-new">Name</label>
        <input id="f-name-new" type="text" value={name} onFocus={(e) => e.currentTarget.select()} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </div>
      <div class="grp seq-actions">
        <code class="seq-preview" title="The id it is stored with">{seq}</code>
        <button class="on" type="submit" disabled={!clean(name)}>{action}</button>
      </div>
    </form>
  )
}

/** Every key used in the workspace's databases. */
function usedKeys(ws: Workspace): string[] {
  const out = new Set<string>()
  for (const f of ws.files) for (const p of f.positions) {
    for (const k of Object.keys(p.tags)) out.add(k)
    for (const m of p.moves) for (const k of Object.keys(m.tags)) out.add(k)
  }
  return [...out]
}

/**
 * Adding a tag in one click: every key the interface knows (and every key used elsewhere) is a chip;
 * a click adds it with its control ready (a yes/no tag is set at once). "New key" creates one: a plain
 * key (text, list, number, yes/no) only lives in the data; one whose type cannot be told from its value
 * (options, a color, a rank, a balance) is also described in db/tags.json.
 */
function AddTag({ on, exclude, used, onAdd, onRename, own }: {
  on: On
  exclude: Set<string>
  used: string[]
  onAdd: (key: string, type: TagType, def: TagDef | null) => void
  onRename: (from: string, to: string) => void
  own: string[]
}) {
  const [creating, setCreating] = useState(false)
  const [key, setKey] = useState('')
  const [type, setType] = useState<TagType>('text')
  const [options, setOptions] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const reg = getRegistry().tags
  const forThis = (d: TagDef) => !d.for || (d.for === 'move') === (on === 'move')
  const known = reg.filter((d) => forThis(d) && !exclude.has(d.key) && d.control !== 'buttons' && d.key !== 'board').map((d) => d.key)
  const elsewhere = sortKeys(used.filter((k) => !defOf(k) && !exclude.has(k)))
  const k = key.trim().toLowerCase().replace(/\s+/g, '-')
  const isNew = !!k && !defOf(k) && !used.includes(k)
  const needsOptions = type === 'choice' || type === 'multi'
  const create = (e?: Event) => {
    e?.preventDefault()
    if (!k || exclude.has(k)) return
    let def: TagDef | null = null
    if (isNew && !['text', 'list', 'number', 'flag'].includes(type)) {
      const opts = options.split(',').map((x) => x.trim()).filter(Boolean)
      if (needsOptions && !opts.length) return
      def = { key: k, label: key.trim(), type, for: on === 'move' ? 'move' : 'position', ...(needsOptions ? { options: opts.map((o) => ({ value: o.toLowerCase().replace(/\s+/g, '-'), label: o })) } : {}) }
      if (type === 'slider') Object.assign(def, { ends: ['White', 'Black'], negate: true })
    }
    onAdd(k, isNew ? type : typeOf(k), def)
    setKey('')
    setOptions('')
    setType('text')
    setCreating(false)
  }
  return (
    <div class="add-tag">
      <div class="add-tag-chips" role="group" aria-label="Add a tag">
        <span class="add-label">Add:</span>
        {known.map((x) => (
          <button key={x} class="chip add-chip" title={describe(x)} onClick={() => onAdd(x, typeOf(x), null)}>+ {labelOf(x)}</button>
        ))}
        {elsewhere.map((x) => (
          <button key={x} class="chip add-chip free" title={`${x}: used elsewhere in the databases`} onClick={() => onAdd(x, typeOf(x), null)}>+ {labelOf(x)}</button>
        ))}
        <button class="chip add-chip new" id={`add-tag-${on}`} onClick={() => setCreating(!creating)} aria-expanded={creating}>+ New key…</button>
      </div>
      {creating && (
        <form class="new-key" onSubmit={create}>
          <div class="grp">
            <input id={`add-tag-key-${on}`} value={key} placeholder="New key" aria-label="Tag key" onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
            {isNew && (
              <select aria-label="Type of the new tag" value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as TagType)}>
                {NEW_KEY_TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
              </select>
            )}
            <button class="on" type="submit" disabled={!k || exclude.has(k) || (isNew && needsOptions && !options.trim())}>Add</button>
          </div>
          {isNew && needsOptions && <input value={options} placeholder="Options, comma separated" aria-label="Options" onInput={(e) => setOptions((e.target as HTMLInputElement).value)} />}
        </form>
      )}
      {own.length > 0 && (
        renaming ? (
          <form class="grp" onSubmit={(e) => {
            e.preventDefault()
            const to = ((e.currentTarget as HTMLFormElement).elements.namedItem('to') as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g, '-')
            if (to) onRename(renaming, to)
            setRenaming(null)
          }}>
            <select value={renaming} onChange={(e) => setRenaming((e.target as HTMLSelectElement).value)}>{own.map((o) => <option key={o}>{o}</option>)}</select>
            <input name="to" placeholder="new key" />
            <button type="submit">Rename</button>
          </form>
        ) : (
          <button class="link small" onClick={() => setRenaming(own[0])}>Rename a key…</button>
        )
      )}
    </div>
  )
}
