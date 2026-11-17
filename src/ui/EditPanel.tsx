/**
 * Edit panel (SPEC §10.1): annotate the current move and position in the target database.
 * Writing anything on a move played freely saves the line up to it.
 */
import { useState } from 'preact/hooks'
import { CATEGORIES, JOSEKI_CATEGORIES, SHAPE_CATEGORIES, flipValue, type Category } from '../core/fields'
import { apply, compose, inverse, parsePt, parseSgfPtList, ptName, type Pt } from '../core/geometry'
import { sgfPoint } from '../edit/sgfio'
import { locate, setProps, type Location } from '../edit/ops'
import type { Workspace } from '../edit/workspace'
import { frame, primaryLabel, type Ctx, type Step } from '../view'

const COLOR_PROPS = new Set(['XEV', 'XSEN', 'XPB'])
const SWAP_PAIRS: Record<string, string> = { XSB: 'XSW', XSW: 'XSB', XRESB: 'XRESW', XRESW: 'XRESB' }
const POINT_PROPS = new Set(['XVITAL'])
const LIST_PROPS = new Set(['XALIAS', 'XTAG', 'XSRC', 'XCOND'])
const STD_MARKS = (c: string | undefined) => ({
  TE: c && ['main', 'alt', 'punish', 'correct'].includes(c) ? ['1'] : null,
  BM: c && ['mistake', 'overplay', 'wrong'].includes(c) ? ['1'] : null,
  DO: c === 'slack' ? [''] : null,
  IT: c && ['situational', 'trick'].includes(c) ? [''] : null,
})
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export interface EditApi {
  ws: Workspace
  ctx: Ctx
  path: Step[]
  target: string
  shapes: boolean
  commit: (msg?: string) => void
  onFocusText: (el: HTMLTextAreaElement) => void
  onDeleteMove: () => void
  /** Design tab: show one group of fields (with its extra fields open) instead of everything. */
  only?: 'move' | 'pos' | 'name'
}

export function EditPanel(p: EditApi) {
  const { ctx, path } = p
  const [more, setMore] = useState(false)
  const [naming, setNaming] = useState('')
  const F = frame(ctx, path[path.length - 1])
  const label = primaryLabel(ctx, path)

  const where = (create: boolean): Location | null => locate(p.ws, ctx, path, p.target, label, create)
  const toDisplay = (loc: Location) => compose(F, loc.T)

  const read = (prop: string): string => {
    const loc = where(false)
    if (!loc) return ''
    const swap = toDisplay(loc).swap
    const real = swap && SWAP_PAIRS[prop] ? SWAP_PAIRS[prop] : prop
    const vals = loc.node.data[real] ?? []
    if (POINT_PROPS.has(prop)) return vals.flatMap(parseSgfPtList).map((pt) => ptName(apply(toDisplay(loc), pt))).join(', ')
    if (LIST_PROPS.has(prop)) return vals.join(', ')
    const v = vals[0] ?? ''
    return swap && COLOR_PROPS.has(prop) && v ? flipValue(prop, v) : v
  }
  const readList = (prop: string) => where(false)?.node.data[prop] ?? []

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
    const real = swap && SWAP_PAIRS[prop] ? SWAP_PAIRS[prop] : prop
    let vals: string[]
    if (Array.isArray(value)) vals = value
    else if (POINT_PROPS.has(prop)) {
      const toFile = inverse(toDisplay(loc))
      vals = value.split(/[,\s]+/).map(parsePt).filter((x): x is Pt => !!x).map((pt) => sgfPoint(apply(toFile, pt)))
    } else if (LIST_PROPS.has(prop)) vals = value.split(',').map((x) => x.trim()).filter(Boolean)
    else vals = value.trim() ? [swap && COLOR_PROPS.has(prop) ? flipValue(prop, value.trim()) : value.trim()] : []
    const update: Record<string, string[] | null> = { [real]: vals }
    if (prop === 'XCAT') Object.assign(update, STD_MARKS(vals[0]))
    setProps(p.ws, loc, update)
    p.commit(msg)
  }

  const field = (prop: string, label: string, opts: { area?: boolean; placeholder?: string; id?: string } = {}) => {
    const id = opts.id ?? `f-${prop}`
    const hint = others(prop)
    const value = read(prop)
    return (
      <label class="f edit-f" key={id + value}>
        <span class="fl">{label}</span>
        <span class="fv">
          {opts.area ? (
            <textarea id={id} defaultValue={value} placeholder={opts.placeholder} onFocus={(e) => p.onFocusText(e.currentTarget)} onBlur={(e) => e.currentTarget.value !== value && write(prop, e.currentTarget.value)} />
          ) : (
            <input id={id} type="text" defaultValue={value} placeholder={opts.placeholder} onBlur={(e) => e.currentTarget.value !== value && write(prop, e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          )}
          {hint && <small class="hint">{hint}</small>}
        </span>
      </label>
    )
  }
  const select = (prop: string, label: string, options: [string, string][]) => (
    <label class="f edit-f">
      <span class="fl">{label}</span>
      <span class="fv">
        <select id={`f-${prop}`} value={read(prop)} onChange={(e) => write(prop, (e.target as HTMLSelectElement).value)}>
          <option value="">—</option>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {others(prop) && <small class="hint">{others(prop)}</small>}
      </span>
    </label>
  )
  const chips = (prop: string, label: string, options: string[]) => {
    const cur = readList(prop)
    return (
      <div class="f edit-f">
        <span class="fl">{label}</span>
        <span class="fv chips">
          {options.map((o) => (
            <button key={o} class={`chip ${cur.includes(o) ? 'on' : ''}`} aria-pressed={cur.includes(o)} onClick={() => write(prop, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])}>{o}</button>
          ))}
        </span>
      </div>
    )
  }

  const status: [string, string][] = [['alive', 'Alive'], ['dead', 'Dead'], ['ko', 'Ko'], ['seki', 'Seki'], ['unsettled', 'Unsettled']]
  const cats: Category[] = p.shapes ? SHAPE_CATEGORIES : JOSEKI_CATEGORIES
  const hasMove = path.length > 1
  const step = path[path.length - 1]
  const targetOwnsMove = step.edge?.contribs.some((c) => c.db === p.target)
  const curCat = read('XCAT')
  const definesHere = !!read('XID') && !!read('XNAME')
  const show = (g: 'move' | 'pos' | 'name') => !p.only || p.only === g

  return (
    <div class="edit-panel">
      {p.only === 'move' && !hasMove && <p class="hint">This is the start of the line: select a move in the tree.</p>}
      {hasMove && show('move') && (
        <section>
          <h2>This move is…</h2>
          <div class="cat-buttons" role="group" aria-label="Category of the last move">
            {cats.map((c, i) => (
              <button
                key={c}
                class={`cat-btn ${curCat === c ? 'on' : ''}`}
                style={{ '--cat': CATEGORIES[c].color } as never}
                aria-pressed={curCat === c}
                title={`${CATEGORIES[c].label} (key ${i + 1})`}
                onClick={() => write('XCAT', curCat === c ? '' : c, curCat === c ? 'Category removed' : `Saved as ${CATEGORIES[c].label.toLowerCase()} in ${p.target}`)}
              >
                <span class={`dot ${CATEGORIES[c].ring ? 'ring' : ''}`} style={{ background: CATEGORIES[c].color, borderColor: CATEGORIES[c].color }} />
                {CATEGORIES[c].label}
              </button>
            ))}
          </div>
          {field('XMW', 'Why', { area: true, id: 'f-node-XMW', placeholder: 'Why this move is good or bad' })}
          {p.only === 'move' && (
            <>
              {!p.shapes && select('XSTY', 'Style', [['aggressive', 'Aggressive'], ['balanced', 'Balanced'], ['solid', 'Solid']])}
              {!p.shapes && chips('XPUR', 'Purpose', ['territory', 'influence', 'sente', 'attack', 'defend', 'sabaki', 'probe', 'reduce', 'connect', 'cut', 'eye', 'kill'])}
              {!p.shapes && field('XCOND', 'Conditions', { placeholder: 'ladder, needs-support…' })}
              {field('XMN', 'Note on the move', { area: true })}
            </>
          )}
        </section>
      )}

      {show('pos') && <section>
        <h2>Result of this position</h2>
        {p.shapes ? (
          <>
            {select('XSB', 'Black next', status)}
            {select('XSW', 'White next', status)}
          </>
        ) : (
          <>
            {field('XPB', 'Points', { placeholder: '+3 = Black ahead by 3, -2 = White ahead by 2' })}
            {select('XEV', 'Evaluation', [['B++', 'Black clearly better'], ['B+', 'Black slightly better'], ['=', 'Even'], ['W+', 'White slightly better'], ['W++', 'White clearly better']])}
            {select('XST', 'Status', [['progress', 'In progress'], ['end', 'Joseki end'], ['end-mistake', 'End after a mistake']])}
          </>
        )}
        {field('XPW', 'Explanation', { area: true })}
        {p.only === 'pos' && (
          <>
            {!p.shapes && field('XPBS', 'Points source', { placeholder: 'katago / book / estimate' })}
            {!p.shapes && select('XSEN', 'Sente', [['B', 'Black'], ['W', 'White'], ['none', 'None']])}
            {!p.shapes && field('XRES', 'Outcome', { area: true, placeholder: 'Who got what' })}
            {!p.shapes && field('XTEN', 'Tenuki here', { area: true })}
            {field('XAJI', 'Watch out (aji)', { area: true })}
            {field('XPN', 'Note', { area: true })}
            {p.shapes && field('XEYE', 'Eyes')}
            {p.shapes && field('XLIB', 'Liberties')}
          </>
        )}
      </section>}

      {show('name') && <section>
        <h2>Name</h2>
        {definesHere ? (
          <>
            {field('XNAME', 'Name')}
            {field('XFAM', 'Family', { placeholder: '4-4 point/3-3 invasion' })}
            {field('XDIFF', 'Difficulty', { placeholder: '15k' })}
            {field('XSUM', 'Summary', { area: true })}
            {p.only === 'name' && (
              <>
                {field('XALIAS', 'Also called', { placeholder: 'comma separated' })}
                {field('XTAG', 'Tags', { placeholder: 'comma separated' })}
                {field('XSRC', 'Sources', { placeholder: 'comma separated' })}
                {p.shapes && select('XLOC', 'Location', [['corner', 'Corner'], ['side', 'Side'], ['center', 'Center']])}
                {p.shapes && select('XRESB', 'Black first', status)}
                {p.shapes && select('XRESW', 'White first', status)}
                {p.shapes && field('XVITAL', 'Vital points', { placeholder: 'e.g. T15' })}
              </>
            )}
          </>
        ) : (
          <form class="name-form" onSubmit={(e) => {
            e.preventDefault()
            const name = naming.trim()
            if (!name) return
            const loc = where(true)!
            const update: Record<string, string[] | null> = { XID: [slug(name)], XNAME: [name] }
            if (p.shapes) update.XTYPE = ['shape']
            setProps(p.ws, loc, update)
            setNaming('')
            p.commit(`Named this position "${name}"`)
          }}>
            <p class="hint">{label ? `Part of ${label}. Give it its own name if a new joseki or variation starts here.` : 'Give this position a name to find it later and to label the moves that follow.'}</p>
            <div class="grp">
              <input id="f-name-new" type="text" value={naming} placeholder="e.g. 3-3 invasion, hane variation" onInput={(e) => setNaming((e.target as HTMLInputElement).value)} />
              <button class="on" type="submit" disabled={!naming.trim()}>Name this position</button>
            </div>
          </form>
        )}
      </section>}

      {!p.only && <button class="more-toggle" aria-expanded={more} onClick={() => setMore(!more)}>{more ? '▾' : '▸'} More fields</button>}
      {!p.only && more && (
        <section class="more">
          {hasMove && !p.shapes && select('XSTY', 'Style', [['aggressive', 'Aggressive'], ['balanced', 'Balanced'], ['solid', 'Solid']])}
          {hasMove && !p.shapes && chips('XPUR', 'Purpose', ['territory', 'influence', 'sente', 'attack', 'defend', 'sabaki', 'probe', 'reduce', 'connect', 'cut', 'eye', 'kill'])}
          {hasMove && !p.shapes && field('XCOND', 'Conditions', { placeholder: 'ladder, needs-support…' })}
          {hasMove && field('XMN', 'Note on the move', { area: true })}
          {!p.shapes && field('XPBS', 'Points source', { placeholder: 'katago / book / estimate' })}
          {!p.shapes && select('XSEN', 'Sente', [['B', 'Black'], ['W', 'White'], ['none', 'None']])}
          {!p.shapes && field('XRES', 'Outcome', { area: true, placeholder: 'Who got what' })}
          {!p.shapes && field('XTEN', 'Tenuki here', { area: true })}
          {field('XAJI', 'Watch out (aji)', { area: true })}
          {field('XPN', 'Note', { area: true })}
          {p.shapes && field('XEYE', 'Eyes')}
          {p.shapes && field('XLIB', 'Liberties')}
          {definesHere && (
            <>
              {field('XALIAS', 'Also called', { placeholder: 'comma separated' })}
              {field('XTAG', 'Tags', { placeholder: 'comma separated' })}
              {field('XSRC', 'Sources', { placeholder: 'comma separated' })}
              {!p.shapes && chips('XERA', 'Era', ['classic', 'modern', 'ai'])}
              {p.shapes && select('XLOC', 'Location', [['corner', 'Corner'], ['side', 'Side'], ['center', 'Center']])}
              {p.shapes && select('XRESB', 'Black first', status)}
              {p.shapes && select('XRESW', 'White first', status)}
              {p.shapes && field('XVITAL', 'Vital points', { placeholder: 'e.g. T15' })}
            </>
          )}
        </section>
      )}

      {targetOwnsMove && show('move') && <button class="danger" onClick={p.onDeleteMove}>Delete this move and what follows from {p.target}</button>}
    </div>
  )
}
