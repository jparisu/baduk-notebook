/**
 * The value schema (docs/MODEL.md §2): which keys a position or a move may carry in its `values`
 * dictionary, their type, allowed options, icons and colors, and what Swap colors does to them.
 * It lives in db/schema.json and can be edited in the app.
 */

export type FieldType = 'choice' | 'multi' | 'slider' | 'flag' | 'color' | 'text' | 'list'
export type FieldFor = 'move' | 'position' | 'sequence'

export interface FieldOption {
  value: string
  label: string
  /** A short symbol or emoji shown before the label. */
  icon?: string
  color?: string
  /** The option this one becomes when colors are swapped (e.g. "B-alive" ↔ "W-alive"). */
  swap?: string
  /** Move categories: counts as a good move (quiz answers, main lines). */
  good?: boolean
  /** Move categories: drawn as a ring instead of a filled dot. */
  ring?: boolean
}

export interface FieldDef {
  key: string
  label: string
  for: FieldFor
  type: FieldType
  options?: FieldOption[]
  /** Slider: the two ends, from the low to the high value. */
  ends?: [string, string]
  /** Slider: Swap colors turns the value around (low ↔ high). */
  negate?: boolean
  /** Key that trades places with this one when colors are swapped ("black-first" ↔ "white-first"). */
  swapKey?: string
  /** A position without its own value shows the one of the closest earlier position. */
  inherit?: boolean
  /** Choice: big buttons instead of a dropdown. */
  control?: 'buttons' | 'dropdown'
  icon?: string
  hint?: string
}

export interface Schema {
  fields: FieldDef[]
}

/** Built-in keys and the internal names the app has always used for them. Other keys are used as they are. */
const ALIASES: Record<string, string> = {
  category: 'XCAT', evaluation: 'XEV', status: 'XST', 'black-first': 'XSB', 'white-first': 'XSW', sente: 'XSEN',
  style: 'XSTY', purpose: 'XPUR', conditions: 'XCOND', difficulty: 'XDIFF', tags: 'XTAG', summary: 'XSUM', aliases: 'XALIAS', sources: 'XSRC', era: 'XERA',
}
const REVERSE = Object.fromEntries(Object.entries(ALIASES).map(([k, v]) => [v, k]))
/** Internal property name of a key. */
export const propOf = (key: string) => ALIASES[key] ?? key
/** Key of an internal property name. */
export const keyOf = (prop: string) => REVERSE[prop] ?? prop

let current: Schema = { fields: [] }
const listeners: ((s: Schema) => void)[] = []
export const getSchema = () => current
export function setSchema(s: Schema) {
  current = s
  for (const f of listeners) f(s)
}
export const onSchema = (f: (s: Schema) => void) => listeners.push(f)

export const fieldOf = (key: string) => current.fields.find((f) => f.key === key)
export const fieldOfProp = (prop: string) => fieldOf(keyOf(prop))
export const fieldsFor = (target: FieldFor) => current.fields.filter((f) => f.for === target)

export function parseSchema(text: string): Schema {
  const j = JSON.parse(text) as Schema
  return { fields: Array.isArray(j.fields) ? j.fields : [] }
}
export const writeSchema = (s: Schema) => JSON.stringify(s, null, 2) + '\n'

/** True when Swap colors changes this property's value. */
export function swapsValue(prop: string): boolean {
  const f = fieldOfProp(prop)
  return !!f && (f.type === 'color' || (f.type === 'slider' && !!f.negate) || !!f.options?.some((o) => o.swap))
}

/** The value seen with colors swapped. */
export function swapValue(prop: string, v: string): string {
  const f = fieldOfProp(prop)
  if (!f) return v
  if (f.type === 'color') return v === 'B' ? 'W' : v === 'W' ? 'B' : v
  if (f.type === 'slider' && f.negate) {
    const n = Number(v)
    return Number.isFinite(n) ? String(-n + 0) : v
  }
  return f.options?.find((o) => o.value === v)?.swap ?? v
}

/** The property shown in this place when colors are swapped ("XSB" ↔ "XSW"). */
export function swapProp(prop: string): string {
  const k = fieldOfProp(prop)?.swapKey
  return k ? propOf(k) : prop
}

/** Display text of a stored value. */
export function valueLabel(f: FieldDef, v: string): string {
  if (f.type === 'color') return v === 'B' ? 'Black' : v === 'W' ? 'White' : 'Neither'
  if (f.type === 'flag') return f.label
  const o = f.options?.find((x) => x.value === v)
  return o ? o.label : v
}
