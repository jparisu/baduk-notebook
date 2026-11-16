/** Edit mode panel (SPEC §8.7 edit mode, §10.1): forms for entry, move and position fields of the target database. */
import { useRef } from 'preact/hooks'
import { CATEGORIES, JOSEKI_CATEGORIES, SHAPE_CATEGORIES, flipValue } from '../core/fields'
import { apply, compose, inverse, parsePt, parseSgfPtList, ptName, type Pt } from '../core/geometry'
import { sgfPoint } from '../edit/sgfio'
import { locate, setProps, type Location } from '../edit/ops'
import type { Workspace } from '../edit/workspace'
import { frame, type Ctx, type Step } from '../view'

const COLOR_PROPS = new Set(['XEV', 'XSEN', 'XPB'])
const SWAP_PAIRS: Record<string, string> = { XSB: 'XSW', XSW: 'XSB', XRESB: 'XRESW', XRESW: 'XRESB' }
const POINT_PROPS = new Set(['XVITAL'])
const LIST_PROPS = new Set(['XALIAS', 'XTAG', 'XSRC', 'XCOND'])

type Kind = 'entry' | 'node'

export interface EditApi {
  ws: Workspace
  ctx: Ctx
  path: Step[]
  entryId: string
  target: string
  commit: (msg?: string) => void
  onFocusText: (el: HTMLTextAreaElement) => void
  onDeleteMove: () => void
}

export function EditPanel(p: EditApi) {
  const { ctx, path } = p
  const entry = ctx.graph.entries.get(p.entryId)!
  const isJ = entry.type === 'joseki'
  const F = frame(ctx, path[path.length - 1])
  const F0 = frame(ctx, path[0])
  const lastFocus = useRef<HTMLTextAreaElement | null>(null)

  const where = (kind: Kind, create: boolean): Location | null =>
    locate(p.ws, ctx, kind === 'entry' ? path.slice(0, 1) : path, p.target, p.entryId, create)

  const swapOf = (kind: Kind, loc: Location) => compose(kind === 'entry' ? F0 : F, loc.T).swap
  const fileToDisplay = (kind: Kind, loc: Location) => compose(kind === 'entry' ? F0 : F, loc.T)

  /** Current value of the target database, converted to what the screen shows. */
  const read = (kind: Kind, prop: string): string => {
    const loc = where(kind, false)
    if (!loc) return ''
    const swap = swapOf(kind, loc)
    const real = swap && SWAP_PAIRS[prop] ? SWAP_PAIRS[prop] : prop
    const vals = loc.node.data[real] ?? []
    if (POINT_PROPS.has(prop)) return vals.flatMap(parseSgfPtList).map((pt) => ptName(apply(fileToDisplay(kind, loc), pt))).join(', ')
    if (LIST_PROPS.has(prop)) return vals.join(', ')
    const v = vals[0] ?? ''
    return swap && COLOR_PROPS.has(prop) && v ? flipValue(prop, v) : v
  }
  const readList = (kind: Kind, prop: string) => where(kind, false)?.node.data[prop] ?? []

  /** Values from other databases, shown as a hint. */
  const others = (kind: Kind, prop: string) => {
    const contribs = kind === 'entry' ? entry.contribs : [...ctx.graph.nodes.get(path[path.length - 1].key)!.contribs, ...(path[path.length - 1].edge?.contribs ?? [])]
    const vals = contribs.filter((c) => c.db !== p.target && c.props[prop]).map((c) => `${c.db}: ${c.props[prop].join(', ')}`)
    return vals.length ? vals.join(' · ') : ''
  }

  const write = (kind: Kind, prop: string, value: string | string[]) => {
    const loc = where(kind, true)!
    const swap = swapOf(kind, loc)
    const real = swap && SWAP_PAIRS[prop] ? SWAP_PAIRS[prop] : prop
    let vals: string[]
    if (Array.isArray(value)) vals = value
    else if (POINT_PROPS.has(prop)) {
      const toFile = inverse(fileToDisplay(kind, loc))
      vals = value.split(/[,\s]+/).map(parsePt).filter((x): x is Pt => !!x).map((pt) => sgfPoint(apply(toFile, pt)))
    } else if (LIST_PROPS.has(prop)) vals = value.split(',').map((x) => x.trim()).filter(Boolean)
    else vals = value.trim() ? [swap && COLOR_PROPS.has(prop) ? flipValue(prop, value.trim()) : value.trim()] : []
    const update: Record<string, string[] | null> = { [real]: vals }
    // Keep the standard SGF marks in step with the category (SPEC §4.3).
    if (prop === 'XCAT') {
      const c = vals[0]
      update.TE = c && ['main', 'alt', 'punish', 'correct'].includes(c) ? ['1'] : null
      update.BM = c && ['mistake', 'overplay', 'wrong'].includes(c) ? ['1'] : null
      update.DO = c === 'slack' ? [''] : null
      update.IT = c && ['situational', 'trick'].includes(c) ? [''] : null
    }
    setProps(p.ws, loc, update)
    p.commit()
  }

  const text = (kind: Kind, prop: string, label: string, area = false, placeholder = '') => {
    const id = `f-${kind}-${prop}`
    const hint = others(kind, prop)
    return (
      <label class="f edit-f" key={id + read(kind, prop)}>
        <span class="fl">{label}</span>
        <span class="fv">
          {area ? (
            <textarea
              id={id}
              defaultValue={read(kind, prop)}
              placeholder={placeholder}
              onFocus={(e) => {
                lastFocus.current = e.currentTarget
                p.onFocusText(e.currentTarget)
              }}
              onBlur={(e) => e.currentTarget.value !== read(kind, prop) && write(kind, prop, e.currentTarget.value)}
            />
          ) : (
            <input
              id={id}
              type="text"
              defaultValue={read(kind, prop)}
              placeholder={placeholder}
              onBlur={(e) => e.currentTarget.value !== read(kind, prop) && write(kind, prop, e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          )}
          {hint && <small class="hint">{hint}</small>}
        </span>
      </label>
    )
  }

  const select = (kind: Kind, prop: string, label: string, options: [string, string][]) => {
    const hint = others(kind, prop)
    return (
      <label class="f edit-f">
        <span class="fl">{label}</span>
        <span class="fv">
          <select id={`f-${kind}-${prop}`} value={read(kind, prop)} onChange={(e) => write(kind, prop, (e.target as HTMLSelectElement).value)}>
            <option value="">—</option>
            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {hint && <small class="hint">{hint}</small>}
        </span>
      </label>
    )
  }

  const chips = (kind: Kind, prop: string, label: string, options: string[]) => {
    const cur = readList(kind, prop)
    return (
      <div class="f edit-f">
        <span class="fl">{label}</span>
        <span class="fv chips">
          {options.map((o) => (
            <button key={o} class={`chip ${cur.includes(o) ? 'on' : ''}`} aria-pressed={cur.includes(o)} onClick={() => write(kind, prop, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])}>
              {o}
            </button>
          ))}
        </span>
      </div>
    )
  }

  const status = [['alive', 'Alive'], ['dead', 'Dead'], ['ko', 'Ko'], ['seki', 'Seki'], ['unsettled', 'Unsettled']] as [string, string][]
  const cats = (isJ ? JOSEKI_CATEGORIES : SHAPE_CATEGORIES).map((c) => [c, CATEGORIES[c].label] as [string, string])
  const hasMove = path.length > 1
  const targetOwnsMove = path[path.length - 1].edge?.contribs.some((c) => c.db === p.target)

  return (
    <div class="edit-panel">
      <p class="edit-banner">Editing <b>{p.target}</b>. Changes are saved in this browser until you export them.</p>

      <h3>{isJ ? 'Joseki' : 'Shape'}</h3>
      {text('entry', 'XNAME', 'Name')}
      {isJ ? (
        <>
          {text('entry', 'XALIAS', 'Also called', false, 'comma separated')}
          {text('entry', 'XFAM', 'Family', false, '4-4 point/3-3 invasion')}
          {text('entry', 'XDIFF', 'Difficulty', false, '15k')}
          {chips('entry', 'XERA', 'Era', ['classic', 'modern', 'ai'])}
          {text('entry', 'XTAG', 'Tags', false, 'comma separated')}
        </>
      ) : (
        <>
          {text('entry', 'XSIZE', 'Eye space size')}
          {select('entry', 'XLOC', 'Location', [['corner', 'Corner'], ['side', 'Side'], ['center', 'Center']])}
          {select('entry', 'XSURR', 'Surroundings', [['full', 'Fully enclosed'], ['partial', 'Partially enclosed'], ['open', 'Open']])}
          {text('entry', 'XOLIB', 'Outside liberties')}
          {text('entry', 'XINSIDE', 'Attacker stones inside')}
          {select('entry', 'XARR', 'Arrangement', [['connected', 'Connected'], ['separated', 'Separated']])}
          {select('entry', 'XRESB', 'Black first', status)}
          {select('entry', 'XRESW', 'White first', status)}
          {text('entry', 'XVITAL', 'Vital points', false, 'e.g. T15')}
          {select('entry', 'XKOT', 'Ko type', [['direct', 'Direct'], ['approach1', 'One-move approach'], ['approach2', 'Two-move approach'], ['10000year', 'Ten-thousand-year']])}
          {text('entry', 'XDIFF', 'Difficulty', false, '25k')}
        </>
      )}
      {text('entry', 'XSUM', 'Summary', true)}
      {text('entry', 'XSRC', 'Sources', false, 'comma separated')}

      {hasMove && (
        <>
          <h3>Last move</h3>
          {select('node', 'XCAT', 'Category', cats)}
          {isJ && select('node', 'XSTY', 'Style', [['aggressive', 'Aggressive'], ['balanced', 'Balanced'], ['solid', 'Solid']])}
          {isJ && chips('node', 'XPUR', 'Purpose', ['territory', 'influence', 'sente', 'attack', 'defend', 'sabaki', 'probe', 'reduce', 'connect', 'cut', 'eye', 'kill'])}
          {isJ && text('node', 'XCOND', 'Conditions', false, 'ladder, needs-support…')}
          {text('node', 'XMW', 'Why this move', true, 'Use the mark buttons to link words to points')}
          {text('node', 'XMN', 'Note on the move', true)}
          {targetOwnsMove && (
            <button class="danger" onClick={p.onDeleteMove}>Delete this move from {p.target}</button>
          )}
        </>
      )}

      <h3>Position</h3>
      {isJ ? (
        <>
          {select('node', 'XST', 'Status', [['start', 'Start'], ['progress', 'In progress'], ['end', 'Joseki end'], ['end-mistake', 'End after a mistake']])}
          {select('node', 'XEV', 'Evaluation', [['B++', 'Black clearly better'], ['B+', 'Black slightly better'], ['=', 'Even'], ['W+', 'White slightly better'], ['W++', 'White clearly better']])}
          {text('node', 'XPB', 'Point balance', false, '+0.5 (Black\'s view)')}
          {text('node', 'XPBS', 'Balance source', false, 'katago / book / estimate')}
          {select('node', 'XSEN', 'Sente', [['B', 'Black'], ['W', 'White'], ['none', 'None']])}
          {text('node', 'XRES', 'Result', true)}
          {text('node', 'XTEN', 'Tenuki here', true)}
          {text('node', 'XAJI', 'Watch out (aji)', true)}
        </>
      ) : (
        <>
          {select('node', 'XSB', 'Black next', status)}
          {select('node', 'XSW', 'White next', status)}
          {text('node', 'XEYE', 'Eyes')}
          {text('node', 'XLIB', 'Liberties')}
        </>
      )}
      {text('node', 'XPW', 'Explanation', true)}
      {text('node', 'XPN', 'Note', true)}
      <p class="hint">Keys: 1–8 category · A/B/S style · P tenuki · Enter edits "why" · Esc back to the board.</p>
    </div>
  )
}
