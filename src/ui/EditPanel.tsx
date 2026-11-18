/**
 * Edit panel (SPEC §10.1): annotate the current move and position in the target database.
 * Writing anything on a move played freely saves the line up to it.
 */
import { useState } from 'preact/hooks'
import { isListProp } from '../core/fields'
import { fieldsFor, propOf, swapProp, swapValue, swapsValue, type FieldDef } from '../core/schema'
import { apply, compose, inverse, parsePt, parseSgfPtList, ptName, type Pt } from '../core/geometry'
import { sgfPoint } from '../edit/sgfio'
import { locate, nameSequence, setProps, type Location } from '../edit/ops'
import { isStartId, seqOf } from '../core/model'
import type { Workspace } from '../edit/workspace'
import { frame, isInherited, lineFields, primaryLabel, type Ctx, type Step } from '../view'

const POINT_PROPS = new Set<string>()

export interface EditApi {
  ws: Workspace
  ctx: Ctx
  path: Step[]
  target: string
  commit: (msg?: string) => void
  onFocusText: (el: HTMLTextAreaElement) => void
  onDeleteMove: () => void
  /** Design tab: show one group of fields (with its extra fields open) instead of everything. */
  only?: 'move' | 'pos' | 'name'
}

export function EditPanel(p: EditApi) {
  const { ctx, path } = p
  const [naming, setNaming] = useState('')
  const F = frame(ctx, path[path.length - 1])
  const label = primaryLabel(ctx, path)

  const where = (create: boolean): Location | null => locate(p.ws, ctx, path, p.target, label, create)
  const toDisplay = (loc: Location) => compose(F, loc.T)

  const read = (prop: string): string => {
    const loc = where(false)
    if (!loc) return ''
    const swap = toDisplay(loc).swap
    // With Swap colors on, "Black plays first" shows the stored "White plays first", and values are swapped.
    const real = swap ? swapProp(prop) : prop
    const vals = loc.node.data[real] ?? []
    if (POINT_PROPS.has(prop)) return vals.flatMap(parseSgfPtList).map((pt) => ptName(apply(toDisplay(loc), pt))).join(', ')
    if (isListProp(prop)) return vals.join(', ')
    const v = vals[0] ?? ''
    return swap && swapsValue(real) && v ? swapValue(real, v) : v
  }
  const readList = (prop: string) => {
    const loc = where(false)
    if (!loc) return []
    const swap = toDisplay(loc).swap
    const real = swap ? swapProp(prop) : prop
    return (loc.node.data[real] ?? []).map((v) => (swap && swapsValue(real) ? swapValue(real, v) : v))
  }

  /** A value inherited from an earlier position of the line (shown greyed until you write your own). */
  const lf = lineFields(ctx, path)
  const inherited = (prop: string): { value: string; from: number } | null => {
    if (!isInherited(prop) || read(prop)) return null
    const i = lf.source(prop)
    if (i === null || i === path.length - 1) return null
    const v = isListProp(prop) ? lf.list(prop).join(', ') : lf.one(prop)?.value ?? ''
    return v ? { value: v, from: i } : null
  }
  const fromText = (i: number) => (i === 0 ? 'the start' : `move ${i}`)

  /** Values stored by other databases, shown as a hint under the field. */
  const others = (prop: string) => {
    const step = path[path.length - 1]
    const contribs = [...(ctx.graph.nodes.get(step.key)?.contribs ?? []), ...(step.edge?.contribs ?? [])]
    const entryContribs = label ? ctx.graph.entries.get(label)!.contribs : []
    const vals = [...contribs, ...entryContribs].filter((c) => c.db !== p.target && c.props[prop]).map((c) => `${c.db}: ${c.props[prop].join(', ')}`)
    return [...new Set(vals)].join(' · ')
  }

  const write = (prop: string, value: string | string[], msg?: string) => {
    const loc = where(true)!
    const swap = toDisplay(loc).swap
    const real = swap ? swapProp(prop) : prop
    let vals: string[]
    if (Array.isArray(value)) vals = value
    else if (POINT_PROPS.has(prop)) {
      const toFile = inverse(toDisplay(loc))
      vals = value.split(/[,\s]+/).map(parsePt).filter((x): x is Pt => !!x).map((pt) => sgfPoint(apply(toFile, pt)))
    } else if (isListProp(prop)) vals = value.split(',').map((x) => x.trim()).filter(Boolean)
    else vals = value.trim() ? [value.trim()] : []
    if (swap && swapsValue(real)) vals = vals.map((v) => swapValue(real, v))
    setProps(p.ws, loc, { [real]: vals })
    p.commit(msg)
  }

  const field = (prop: string, label: string, opts: { area?: boolean; placeholder?: string; id?: string } = {}) => {
    const id = opts.id ?? `f-${prop}`
    const hint = others(prop)
    const value = read(prop)
    const inh = inherited(prop)
    return (
      <label class="f edit-f" key={id + value}>
        <span class="fl">{label}</span>
        <span class="fv">
          {opts.area ? (
            <textarea id={id} defaultValue={value} placeholder={inh ? `Inherited from ${fromText(inh.from)}: ${inh.value}` : opts.placeholder} onFocus={(e) => p.onFocusText(e.currentTarget)} onBlur={(e) => e.currentTarget.value !== value && write(prop, e.currentTarget.value)} />
          ) : (
            <input id={id} type="text" defaultValue={value} placeholder={inh ? `${inh.value} (inherited from ${fromText(inh.from)})` : opts.placeholder} onBlur={(e) => e.currentTarget.value !== value && write(prop, e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          )}
          {inh && <small class="hint inherited">↑ Inherited from {fromText(inh.from)}. Write here to change it from this move on.</small>}
          {hint && <small class="hint">{hint}</small>}
        </span>
      </label>
    )
  }
  /** Several notes: one box each (empty it or press × to remove), plus an empty box to add one. */
  const notes = (prop: 'XPW' | 'XMW', label: string, hint: string) => {
    const own = readList(prop)
    const src = own.length ? null : lf.source(prop)
    const inh = prop === 'XPW' && src !== null && src < path.length - 1 ? lf.list(prop) : []
    const other = others(prop)
    const firstId = prop === 'XMW' ? 'f-node-XMW' : 'f-XPW'
    const save = (list: string[]) => write(prop, list.map((x) => x.trim()).filter(Boolean))
    return (
      <div class="f edit-f notes-f" key={prop + own.join('\u0001')}>
        <span class="fl">{label}</span>
        <span class="fv">
          {own.map((t, i) => (
            <div class="note-item" key={i}>
              <textarea id={i === 0 ? firstId : `${firstId}-${i}`} defaultValue={t} onFocus={(e) => p.onFocusText(e.currentTarget)} onBlur={(e) => e.currentTarget.value !== t && save(own.map((x, j) => (j === i ? e.currentTarget.value : x)))} />
              <button class="icon ghost" title="Remove this note" aria-label="Remove this note" onClick={() => save(own.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <textarea
            id={own.length ? `${firstId}-new` : firstId}
            class="note-new"
            placeholder={own.length ? 'Add another note…' : inh.length ? `Inherited from ${fromText(src!)}: ${inh.join(' · ')}` : hint}
            onFocus={(e) => p.onFocusText(e.currentTarget)}
            onBlur={(e) => e.currentTarget.value.trim() && save([...own, e.currentTarget.value])}
          />
          {inh.length > 0 && <small class="hint inherited">↑ Inherited from {fromText(src!)}. Write a note here to replace them from this move on.</small>}
          {other && <small class="hint">{other}</small>}
        </span>
      </div>
    )
  }
  const select = (prop: string, label: string, options: [string, string][]) => (
    <label class="f edit-f">
      <span class="fl">{label}</span>
      <span class="fv">
        <select id={`f-${prop}`} value={read(prop)} onChange={(e) => write(prop, (e.target as HTMLSelectElement).value)}>
          <option value="">{inherited(prop) ? `↑ ${options.find((o) => o[0] === inherited(prop)!.value)?.[1] ?? inherited(prop)!.value} (inherited from ${fromText(inherited(prop)!.from)})` : '—'}</option>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {others(prop) && <small class="hint">{others(prop)}</small>}
      </span>
    </label>
  )
  const chips = (prop: string, label: string, options: string[], labelOf: (v: string) => string = (v) => v) => {
    const cur = readList(prop)
    return (
      <div class="f edit-f">
        <span class="fl">{label}</span>
        <span class="fv chips">
          {options.map((o) => (
            <button key={o} class={`chip ${cur.includes(o) ? 'on' : ''}`} aria-pressed={cur.includes(o)} onClick={() => write(prop, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])}>{labelOf(o)}</button>
          ))}
        </span>
      </div>
    )
  }

  /** One key of the schema, with the control its type asks for. */
  const valueField = (f: FieldDef) => {
    const prop = propOf(f.key)
    const cur = read(prop)
    const inh = inherited(prop)
    const opts = f.options ?? []
    const optLabel = (v: string) => opts.find((o) => o.value === v)?.label ?? v
    switch (f.type) {
      case 'choice':
        if (f.control === 'buttons')
          return (
            <div class="f-block" key={f.key}>
              <h2>{f.label}{f.label.endsWith('…') ? '' : '…'}</h2>
              <div class="cat-buttons" role="group" aria-label={f.label}>
                {opts.map((o, i) => (
                  <button
                    key={o.value}
                    class={`cat-btn ${cur === o.value ? 'on' : ''}`}
                    style={{ '--cat': o.color ?? 'var(--accent)' } as never}
                    aria-pressed={cur === o.value}
                    title={f.key === 'category' ? `${o.label} (key ${i + 1})` : o.label}
                    onClick={() => write(prop, cur === o.value ? '' : o.value, cur === o.value ? `${f.label}: removed` : `Saved as ${o.label.toLowerCase()} in ${p.target}`)}
                  >
                    {o.color ? <span class={`dot ${o.ring ? 'ring' : ''}`} style={{ background: o.color, borderColor: o.color }} /> : o.icon && <span aria-hidden>{o.icon}</span>}
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )
        return select(prop, f.label, opts.map((o) => [o.value, `${o.icon ? o.icon + ' ' : ''}${o.label}`]))
      case 'multi':
        return chips(prop, f.label, opts.map((o) => o.value), optLabel)
      case 'slider': {
        const shown = cur !== '' ? Number(cur) : inh ? Number(inh.value) : 0
        return (
          <div class="f edit-f slider-f" key={f.key + cur}>
            <span class="fl">{f.label}</span>
            <span class="fv">
              <span class="slider-row">
                <span class="bar-end">{f.ends?.[0] ?? ''}</span>
                <input id={`f-${prop}`} type="range" min="-1" max="1" step="0.05" class={cur === '' ? 'unset' : ''} value={shown} aria-label={f.label} onChange={(e) => write(prop, String(Number((e.target as HTMLInputElement).value)))} />
                <span class="bar-end">{f.ends?.[1] ?? ''}</span>
              </span>
              {cur !== '' ? <button class="link small" onClick={() => write(prop, '')}>Clear</button> : inh ? <small class="hint inherited">↑ Inherited from {fromText(inh.from)}. Move the slider to change it from this move on.</small> : <small class="hint">Not set: move the slider to set it.</small>}
            </span>
          </div>
        )
      }
      case 'flag':
        return (
          <label class="f edit-f flag-f" key={f.key}>
            <span class="fl">{f.label}</span>
            <span class="fv"><input id={`f-${prop}`} type="checkbox" checked={cur === '1'} onChange={(e) => write(prop, (e.target as HTMLInputElement).checked ? '1' : '')} /> {f.icon} {f.hint ?? ''}</span>
          </label>
        )
      case 'color':
        return (
          <div class="f edit-f" key={f.key}>
            <span class="fl">{f.label}</span>
            <span class="fv">
              <span class="seg" role="group" aria-label={f.label}>
                {([['B', 'Black'], ['W', 'White'], ['none', 'Neither']] as const).map(([v, l]) => (
                  <button key={v} class={cur === v ? 'on' : ''} aria-pressed={cur === v} onClick={() => write(prop, cur === v ? '' : v)}>{l}</button>
                ))}
              </span>
              {!cur && inh && <small class="hint inherited">↑ {inh.value === 'B' ? 'Black' : inh.value === 'W' ? 'White' : 'Neither'}, inherited from {fromText(inh.from)}</small>}
            </span>
          </div>
        )
      case 'list':
        return field(prop, f.label, { placeholder: f.hint ?? 'comma separated' })
      default:
        return field(prop, f.label, { area: f.key === 'summary', placeholder: f.hint })
    }
  }

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
  const show = (g: 'move' | 'pos' | 'name') => !p.only || p.only === g

  return (
    <div class="edit-panel">
      {p.only === 'move' && !hasMove && <p class="hint">This is the start of the line: select a move in the tree.</p>}
      {hasMove && show('move') && (
        <section>
          {fieldsFor('move').filter((f) => f.control === 'buttons').map(valueField)}
          {notes('XMW', 'Notes', 'Why this move is good or bad. {{Player}} = who played it, {{Opponent}} = the other.')}
          {fieldsFor('move').filter((f) => f.control !== 'buttons').map(valueField)}
        </section>
      )}

      {show('pos') && <section>
        <h2>This position</h2>
        {fieldsFor('position').map(valueField)}
        {notes('XPW', 'Notes', 'What this position means: the result, what tenuki gives, what to watch out for… {{Player}} = who plays next.')}
      </section>}

      {show('name') && <section>
        <h2>Name</h2>
        {definesHere ? (
          <>
            {field('XNAME', 'Name')}
            <label class="f edit-f" key={'seq' + here!.pos.id}>
              <span class="fl">Sequence id</span>
              <span class="fv">
                <input id="f-seq" type="text" defaultValue={here!.pos.id} onBlur={(e) => e.currentTarget.value.trim() !== here!.pos.id && rename(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                <small class="hint">Nested with "/". Moves after this position that are in the same sequence move with it.</small>
              </span>
            </label>
            {select('XFREE', 'Placement', [['corner', 'Fixed in the corner'], ['horizontal', 'Slides along the top edge'], ['vertical', 'Slides along the right edge'], ['anywhere', 'Anywhere']])}
            {fieldsFor('sequence').map(valueField)}
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
      </section>}

      {targetOwnsMove && show('move') && <button class="danger" onClick={p.onDeleteMove}>Delete this move and what follows from {p.target}</button>}
    </div>
  )
}
