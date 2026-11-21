/**
 * Edit panel (docs/MODEL.md §8): everything about the current position, in the target database —
 * its comments, tags and main move, its name, and then the move that led to it from the previous
 * position of your line. The same position can be reached by other moves, so the move's data is
 * stored apart, on that move. A record only shows the tags it has (plus the ones db/tags.json suggests
 * and the values a position inherits); any key can be added, removed or created on the spot.
 * Writing anything on a move played freely saves the line up to it.
 */
import { useState } from 'preact/hooks'
import {
  NEW_KEY_TYPES, asList, asText, defOf, getRegistry, isListType, labelOf, sortKeys, swapKeyOf, swapValue, swapsValue, toValue, typeOf, valueLabel,
  type TagDef, type TagType, type TagValue,
} from '../core/tags'
import { RANK } from '../core/validate'
import { compose } from '../core/geometry'
import { locate, nameSequence, renameTag, setComments, setTags, type Location, type On } from '../edit/ops'
import { updateRegistry } from '../edit/workspace'
import { isStartId, seqOf } from '../core/model'
import type { Workspace } from '../edit/workspace'
import { apply, ptName } from '../core/geometry'
import { candidates, entryFields, frame, inBook, isInherited, lineFields, mainMove, moveOf, primaryLabel, rootStep, type Ctx, type Step } from '../view'

export interface EditApi {
  ws: Workspace
  ctx: Ctx
  path: Step[]
  target: string
  commit: (msg?: string) => void
  onFocusText: (el: HTMLTextAreaElement) => void
  onDeleteMove: () => void
  /** Makes the last move of a line the main move of the position before it. */
  onMakeMain: (line: Step[]) => void
}

/** Keys edited in their own place, not in the tag list. */
const OWN_PLACE = new Set(['name', 'main'])

export function EditPanel(p: EditApi) {
  const { ctx, path } = p
  const [naming, setNaming] = useState('')
  /** Keys added with "Add tag" that have no value yet, per record, with the type picked for them. */
  const [added, setAdded] = useState<Record<On, Record<string, TagType>>>({ pos: {}, move: {} })
  const F = frame(ctx, path[path.length - 1])
  const label = primaryLabel(ctx, path)

  const where = (create: boolean): Location | null => locate(p.ws, ctx, path, p.target, label, create)
  const swapped = (loc: Location) => compose(F, loc.T).swap
  const recOf = (loc: Location | null, on: On) => (loc ? (on === 'move' ? loc.move : loc.pos) : null)

  /** The stored value of a key, as the display sees it (Swap colors trades "black-first" and "white-first"). */
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

  /** A value inherited from an earlier position of the line (shown greyed until you set your own). */
  const lf = lineFields(ctx, path)
  const inherited = (key: string): { value: TagValue; from: number } | null => {
    if (!isInherited(key) || read('pos', key) !== undefined) return null
    const i = lf.source(key)
    if (i === null || i === path.length - 1) return null
    const r = lf.get(key)
    return r ? { value: r.value, from: i } : null
  }
  const fromText = (i: number) => (i === 0 ? 'the start' : `move ${i}`)

  /** Values stored by other databases, shown as a hint under the field. */
  const others = (on: On, key: string) => {
    const step = path[path.length - 1]
    const contribs = on === 'move' ? step.edge?.contribs ?? [] : ctx.graph.nodes.get(step.key)?.contribs ?? []
    const vals = contribs.filter((c) => c.db !== p.target && c.rec.tags[key] !== undefined).map((c) => `${c.db}: ${asList(c.rec.tags[key]).join(', ')}`)
    return [...new Set(vals)].join(' · ')
  }

  /** One tag with the control its type asks for, and a button to remove it. */
  const tagRow = (on: On, key: string) => {
    const id = `f-${on}-${key}`
    const v = read(on, key)
    const d = defOf(key)
    const type = v === undefined && added[on][key] ? added[on][key] : typeOf(key, v)
    const inh = on === 'pos' ? inherited(key) : null
    const hint = others(on, key)
    const set = (raw: string | string[] | number | boolean | null, msg?: string) => write(on, key, toValue(key, raw, type), msg)
    const opts = d?.options ?? []
    const optLabel = (x: string) => valueLabel(key, x)
    const inhText = inh ? `${asList(inh.value).map(optLabel).join(', ')} (inherited from ${fromText(inh.from)})` : ''
    const remove = v !== undefined && (
      <button class="icon ghost tag-x" title={`Remove ${labelOf(key)}`} aria-label={`Remove ${labelOf(key)}`} onClick={() => write(on, key, null, `${labelOf(key)} removed`)}>×</button>
    )
    let control
    switch (type) {
      case 'choice':
        if (d?.control === 'buttons')
          return (
            <div class="f-block" key={id}>
              <h2>{labelOf(key)}{labelOf(key).endsWith('…') ? '' : '…'}</h2>
              <div class="cat-buttons" role="group" aria-label={labelOf(key)}>
                {opts.map((o, i) => (
                  <button
                    key={o.value}
                    class={`cat-btn ${v === o.value ? 'on' : ''}`}
                    style={{ '--cat': o.color ?? 'var(--accent)' } as never}
                    aria-pressed={v === o.value}
                    title={key === 'kind' ? `${o.label} (key ${i + 1})` : o.label}
                    onClick={() => set(v === o.value ? null : o.value, v === o.value ? `${labelOf(key)}: removed` : `Saved as ${o.label.toLowerCase()} in ${p.target}`)}
                  >
                    {o.color ? <span class={`dot ${o.ring ? 'ring' : ''}`} style={{ background: o.color, borderColor: o.color }} /> : o.icon && <span aria-hidden>{o.icon}</span>}
                    {o.label}
                  </button>
                ))}
              </div>
              {hint && <small class="hint">{hint}</small>}
            </div>
          )
        control = (
          <select id={id} value={asText(v)} onChange={(e) => set((e.target as HTMLSelectElement).value || null)}>
            <option value="">{inh ? `↑ ${inhText}` : '—'}</option>
            {opts.map((o) => <option key={o.value} value={o.value}>{o.icon ? o.icon + ' ' : ''}{o.label}</option>)}
          </select>
        )
        break
      case 'multi': {
        const cur = asList(v)
        control = (
          <span class="chips">
            {opts.map((o) => (
              <button key={o.value} class={`chip ${cur.includes(o.value) ? 'on' : ''}`} aria-pressed={cur.includes(o.value)} onClick={() => set(cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value])}>{o.icon ? o.icon + ' ' : ''}{o.label}</button>
            ))}
          </span>
        )
        break
      }
      case 'slider': {
        const shown = typeof v === 'number' ? v : inh && typeof inh.value === 'number' ? inh.value : 0
        control = (
          <span class="slider-col">
            <span class="slider-row">
              <span class="bar-end">{d?.ends?.[0] ?? ''}</span>
              <input id={id} type="range" min="-1" max="1" step="0.05" class={v === undefined ? 'unset' : ''} value={shown} aria-label={labelOf(key)} onChange={(e) => set(Number((e.target as HTMLInputElement).value))} />
              <span class="bar-end">{d?.ends?.[1] ?? ''}</span>
            </span>
            {v === undefined && !inh && <small class="hint">Not set: move the slider to set it.</small>}
          </span>
        )
        break
      }
      case 'flag':
        control = <label class="flag-f"><input id={id} type="checkbox" checked={v === true} onChange={(e) => set((e.target as HTMLInputElement).checked)} /> {d?.icon} {d?.hint ?? 'Yes'}</label>
        break
      case 'color':
        control = (
          <span class="seg" role="group" aria-label={labelOf(key)}>
            {([['B', 'Black'], ['W', 'White'], ['none', 'Neither']] as const).map(([c, l]) => (
              <button key={c} class={v === c ? 'on' : ''} aria-pressed={v === c} onClick={() => set(v === c ? null : c)}>{l}</button>
            ))}
          </span>
        )
        break
      case 'board':
        control = (
          <textarea id={id} rows={2} defaultValue={asList(v).join('\n')} placeholder={d?.hint ?? 'One shape per line: TR:Q16, AR:Q16-R14, LB:Q16=A'} onBlur={(e) => e.currentTarget.value !== asList(v).join('\n') && set(e.currentTarget.value.split('\n'))} />
        )
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
            placeholder={inh ? inhText : type === 'list' ? 'comma separated' : type === 'rank' ? 'e.g. 15k, 2d' : d?.hint}
            onBlur={(e) => e.currentTarget.value !== text && set(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        )
      }
    }
    return (
      <div class={`f edit-f tag-f ${d ? '' : 'free-key'}`} key={id + JSON.stringify(v ?? null)}>
        <label class="fl" for={id} title={key}>{labelOf(key)}</label>
        <span class="fv">
          <span class="tag-control">{control}{remove}</span>
          {inh && v === undefined && <small class="hint inherited">↑ Inherited from {fromText(inh.from)}. Set it here to change it from this move on.</small>}
          {hint && <small class="hint">{hint}</small>}
        </span>
      </div>
    )
  }

  /** Every key this record shows: its own tags, the suggested ones, inherited ones and the ones just added. */
  const keysOf = (on: On): string[] => {
    const r = recOf(where(false), on)
    const own = Object.keys(r?.tags ?? {}).map((k) => (where(false) && swapped(where(false)!) ? swapKeyOf(k) : k))
    const suggested = getRegistry().tags.filter((d) => d.suggest && (!d.for || (d.for === 'move') === (on === 'move'))).map((d) => d.key)
    const inh = on === 'pos' ? lf.keys().filter((k) => inherited(k)) : []
    // Keys other databases set on this position or move: shown so they can be overridden here.
    const step = path[path.length - 1]
    const contribs = on === 'move' ? step.edge?.contribs ?? [] : ctx.graph.nodes.get(step.key)?.contribs ?? []
    const elsewhere = contribs.filter((c) => c.db !== p.target && ctx.active.has(c.db)).flatMap((c) => Object.keys(c.rec.tags))
    return sortKeys([...own, ...suggested, ...inh, ...elsewhere, ...Object.keys(added[on])]).filter((k) => !OWN_PLACE.has(k))
  }

  /** Several comments: one box each (empty it or press × to remove), plus an empty box to add one. */
  const comments = (on: On, hint: string) => {
    const own = recOf(where(false), on)?.comments ?? []
    const firstId = `f-${on}-comment`
    const save = (list: string[]) => {
      setComments(p.ws, where(true)!, on, list)
      p.commit()
    }
    const step = path[path.length - 1]
    const contribs = on === 'move' ? step.edge?.contribs ?? [] : ctx.graph.nodes.get(step.key)?.contribs ?? []
    const other = contribs.filter((c) => c.db !== p.target && c.rec.comments.length).map((c) => `${c.db}: ${c.rec.comments.length} comment${c.rec.comments.length > 1 ? 's' : ''}`).join(' · ')
    return (
      <div class="f edit-f notes-f" key={on + own.join('\u0001')}>
        <span class="fl">Comments</span>
        <span class="fv">
          {own.map((t, i) => (
            <div class="note-item" key={i}>
              <textarea id={i === 0 ? firstId : `${firstId}-${i}`} defaultValue={t} onFocus={(e) => p.onFocusText(e.currentTarget)} onBlur={(e) => e.currentTarget.value !== t && save(own.map((x, j) => (j === i ? e.currentTarget.value : x)))} />
              <button class="icon ghost" title="Remove this comment" aria-label="Remove this comment" onClick={() => save(own.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <textarea
            id={own.length ? `${firstId}-new` : firstId}
            class="note-new"
            placeholder={own.length ? 'Add another comment…' : hint}
            onFocus={(e) => p.onFocusText(e.currentTarget)}
            onBlur={(e) => e.currentTarget.value.trim() && save([...own, e.currentTarget.value])}
          />
          {other && <small class="hint">{other}</small>}
        </span>
      </div>
    )
  }

  const addTag = (on: On) => (
    <AddTag
      on={on}
      exclude={new Set([...keysOf(on), ...OWN_PLACE])}
      used={usedKeys(p.ws)}
      onAdd={(key, type, def) => {
        if (def) updateRegistry(p.ws, { tags: [...getRegistry().tags, def] })
        setAdded((a) => ({ ...a, [on]: { ...a[on], [key]: type } }))
        p.commit(def ? `New tag "${def.label}" described in db/tags.json (saved in this browser; Export proposes it)` : undefined)
        setTimeout(() => (document.getElementById(`f-${on}-${key}`) as HTMLElement | null)?.focus(), 30)
      }}
      onRename={(from, to) => {
        renameTag(p.ws, where(true)!, on, from, to)
        p.commit(`Renamed ${from} to ${to}`)
      }}
      own={Object.keys(recOf(where(false), on)?.tags ?? {}).filter((k) => !defOf(k))}
    />
  )
  const buttons = (k: string) => defOf(k)?.control === 'buttons'

  const hasMove = path.length > 1
  const step = path[path.length - 1]
  const targetOwnsMove = step.edge?.contribs.some((c) => c.db === p.target)
  const here = where(false)
  const definesHere = !!here && isStartId(here.pos.id)
  const curSeq = here ? seqOf(here.pos.id) : label ?? 'joseki'
  const rename = (seq: string) => {
    const err = nameSequence(p.ws, ctx, path, p.target, seq, null)
    if (err) return p.commit(err)
    p.commit(`This sequence is now ${seq}`)
  }
  const names = asList(read('pos', 'name'))
  const next = candidates(ctx, step)
  const main = mainMove(ctx, step, next)
  // The move into this position, from the previous position of your line.
  const prev = hasMove ? path[path.length - 2] : null
  const m = moveOf(step)
  const moveName = prev && m ? `${(frame(ctx, prev).swap ? -m.sign : m.sign) === 1 ? 'Black' : 'White'} ${m.pt ? ptName(apply(frame(ctx, prev), m.pt)) : 'tenuki'}` : ''
  const prevLabel = prev ? primaryLabel(ctx, path.slice(0, -1)) : null
  const prevName = prevLabel ? entryFields(ctx, prevLabel, rootStep(ctx, prevLabel)).text('name') || seqOf(prevLabel).split('/').pop() : null

  return (
    <div class="edit-panel">
      <section aria-label="This position">
        <h2>This position</h2>
        {comments('pos', 'What this position means: the result, what tenuki gives, what to watch out for… {{Player}} = who plays next.')}
        <h3 class="tags-h">Tags</h3>
        {keysOf('pos').map((k) => tagRow('pos', k))}
        {addTag('pos')}
        {next.length > 0 && (
          <label class="f edit-f">
            <span class="fl">Main move</span>
            <span class="fv">
              <select id="f-pos-main" value={main ? String(next.indexOf(main)) : ''} onChange={(e) => {
                const c = next[Number((e.target as HTMLSelectElement).value)]
                if (c) p.onMakeMain([...path, c.step])
              }}>
                {!main && <option value="">—</option>}
                {next.map((c, i) => <option key={i} value={String(i)}>{c.pt ? ptName(c.pt) : 'Tenuki'}{c.label ? ` · ${c.label}` : ''}</option>)}
              </select>
              <small class="hint">The line the tree and → follow from here, until you take another one.</small>
            </span>
          </label>
        )}
      </section>

      <section aria-label="Name">
        <h2>Name</h2>
        {definesHere ? (
          <>
            <label class="f edit-f" key={'name' + names.join('|')}>
              <span class="fl">Names</span>
              <span class="fv">
                <input id="f-pos-name" type="text" defaultValue={names.join(', ')} onBlur={(e) => e.currentTarget.value !== names.join(', ') && write('pos', 'name', toValue('name', e.currentTarget.value, 'list'))} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                <small class="hint">The first is the title; the others are other names (comma separated).</small>
              </span>
            </label>
            <label class="f edit-f" key={'seq' + here!.pos.id}>
              <span class="fl">Sequence id</span>
              <span class="fv">
                <input id="f-seq" type="text" defaultValue={here!.pos.id} onBlur={(e) => e.currentTarget.value.trim() !== here!.pos.id && rename(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                <small class="hint">Nested with "/". Moves after this position that are in the same sequence move with it.</small>
              </span>
            </label>
            <label class="f edit-f">
              <span class="fl">Placement</span>
              <span class="fv">
                <select id="f-free" value={here!.pos.free} onChange={(e) => {
                  here!.pos.free = (e.target as HTMLSelectElement).value as typeof here.pos.free
                  setTags(p.ws, here!, 'pos', {})
                  p.commit()
                }}>
                  {[['corner', 'Fixed in the corner'], ['horizontal', 'Slides along the top edge'], ['vertical', 'Slides along the right edge'], ['anywhere', 'Anywhere']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </span>
            </label>
          </>
        ) : (
          <form class="name-form" onSubmit={(e) => {
            e.preventDefault()
            const name = naming.trim()
            if (!name) return
            const seq = name.includes('/') ? name : `${curSeq}/${name.split('/').pop()}`
            const err = nameSequence(p.ws, ctx, path, p.target, seq, name.split('/').pop()!.trim())
            setNaming('')
            p.commit(err ?? `Named this position "${name}"`)
          }}>
            <p class="hint">Part of <b>{curSeq}</b>. Name it to start <b>{curSeq}/name</b> here: the moves after it move to the new sequence.</p>
            <div class="grp">
              <input id="f-name-new" type="text" value={naming} placeholder="e.g. 3-3 invasion, hane variation" onInput={(e) => setNaming((e.target as HTMLInputElement).value)} />
              <button class="on" type="submit" disabled={!naming.trim()}>Name this position</button>
            </div>
          </form>
        )}
      </section>

      {hasMove && (
        <section aria-label="The move into this position" class="move-in">
          <h2>The move into it · {moveName}</h2>
          {inBook(ctx, prev!) ? (
            <>
              <p class="hint">From {prevName ? <b>{prevName}</b> : 'the previous position'}, the one before it on your line. Other moves can reach this position too; each keeps its own comments and tags.</p>
              {keysOf('move').filter(buttons).map((k) => tagRow('move', k))}
              {comments('move', 'Why this move is good or bad. {{Player}} = who played it, {{Opponent}} = the other.')}
              <h3 class="tags-h">Tags</h3>
              {keysOf('move').filter((k) => !buttons(k)).map((k) => tagRow('move', k))}
              {addTag('move')}
              {targetOwnsMove && <button class="danger" onClick={p.onDeleteMove}>Delete this move and what follows from {p.target}</button>}
            </>
          ) : (
            <p class="hint">The previous position is not in a database yet. Store it first (annotate it, or Save lines); then this move can be described.</p>
          )}
        </section>
      )}
    </div>
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
 * "Add tag": pick a key the interface knows or one used elsewhere, or type a new one. A new key only lives
 * in the data; when its type cannot be told from the value (options, a color, a rank, a balance) it is
 * also described in db/tags.json.
 */
function AddTag({ on, exclude, used, onAdd, onRename, own }: {
  on: On
  exclude: Set<string>
  used: string[]
  onAdd: (key: string, type: TagType, def: TagDef | null) => void
  onRename: (from: string, to: string) => void
  own: string[]
}) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [type, setType] = useState<TagType>('text')
  const [options, setOptions] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const reg = getRegistry().tags
  const forThis = (d: TagDef) => !d.for || (d.for === 'move') === (on === 'move')
  const known = sortKeys([...reg.filter(forThis).map((d) => d.key), ...used]).filter((k) => !exclude.has(k) && k !== 'kind' && k !== 'name')
  const k = key.trim().toLowerCase().replace(/\s+/g, '-')
  const isNew = !!k && !defOf(k) && !used.includes(k)
  const needsOptions = type === 'choice' || type === 'multi'
  const listId = `keys-${on}`
  const add = (e?: Event) => {
    e?.preventDefault()
    if (!k || exclude.has(k)) return
    let def: TagDef | null = null
    if (isNew && !['text', 'list', 'number', 'flag'].includes(type)) {
      const opts = options.split(',').map((x) => x.trim()).filter(Boolean)
      if (needsOptions && !opts.length) return
      def = { key: k, label: key.trim(), type, for: on === 'move' ? 'move' : 'position', ...(needsOptions ? { options: opts.map((o) => ({ value: o.toLowerCase().replace(/\s+/g, '-'), label: o })) } : {}) }
      if (type === 'slider') Object.assign(def, { ends: ['White', 'Black'], negate: true })
    }
    // A plain new key needs no description: its value says its type.
    onAdd(k, isNew ? type : typeOf(k), def)
    setKey('')
    setOptions('')
    setType('text')
    setOpen(false)
  }
  if (!open)
    return (
      <div class="add-tag">
        <button class="link" id={`add-tag-${on}`} onClick={() => setOpen(true)}>+ Add a tag</button>
        {own.length > 0 && !renaming && <button class="link small" onClick={() => setRenaming(own[0])}>Rename a key…</button>}
        {renaming && (
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
        )}
      </div>
    )
  return (
    <form class="add-tag open" onSubmit={add}>
      <div class="grp">
        <input id={`add-tag-key-${on}`} list={listId} value={key} placeholder="Key, e.g. intention, joseki-era, my-note" aria-label="Tag key" onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
        <datalist id={listId}>{known.map((x) => <option key={x} value={x}>{labelOf(x)}</option>)}</datalist>
        {isNew && (
          <select aria-label="Type of the new tag" value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as TagType)}>
            {NEW_KEY_TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
          </select>
        )}
        <button class="on" type="submit" disabled={!k || exclude.has(k) || (isNew && needsOptions && !options.trim())}>Add</button>
        <button type="button" class="ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {isNew && needsOptions && <input value={options} placeholder="Options, comma separated: aggressive, defensive, solid" aria-label="Options" onInput={(e) => setOptions((e.target as HTMLInputElement).value)} />}
      {k && !isNew && <small class="hint">{defOf(k) ? `${labelOf(k)}: ${defOf(k)!.type}` : 'Used elsewhere in the databases.'}</small>}
      {isNew && <small class="hint">A new key. {needsOptions ? 'Its options are saved in db/tags.json.' : 'It is saved with its first value.'}</small>}
    </form>
  )
}
