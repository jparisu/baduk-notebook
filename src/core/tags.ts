/**
 * Tags (docs/MODEL.md §3): every position and move carries a free dictionary of tags. Any key can be used
 * without declaring it; its value is plain JSON (text, number, yes/no or a list of texts).
 *
 * db/tags.json describes the keys the interface knows: how to show and edit them (type, options with
 * icons and colors, what Swap colors does). A key that is not described is shown as key: value.
 */

export type TagValue = string | number | boolean | string[]
export type Tags = Record<string, TagValue>

export type TagType = 'choice' | 'multi' | 'slider' | 'number' | 'flag' | 'color' | 'text' | 'list' | 'rank' | 'board'
export type TagFor = 'move' | 'position'

export interface TagOption {
  value: string
  label: string
  /** What the option means, shown when you hover it ("Alternative: an unusual but valid play"). */
  description?: string
  /** A short symbol or emoji shown before the label. */
  icon?: string
  color?: string
  /** The option this one becomes when colors are swapped (e.g. "B-alive" ↔ "W-alive"). */
  swap?: string
  /** Move kinds: counts as a good move (quiz answers, main lines). */
  good?: boolean
  /** Move kinds: drawn as a ring instead of a filled dot. */
  ring?: boolean
}

export interface TagDef {
  key: string
  label: string
  /** What the key means, shown when you hover its name. */
  description?: string
  type: TagType
  /** Where the editor offers it first. Any key can still be added to positions and moves alike. */
  for?: TagFor
  /** Shown in "This joseki" (read from the start of the sequence) instead of the position panel. */
  panel?: 'sequence'
  /** Always shown in the editor, even before it has a value. */
  suggest?: boolean
  options?: TagOption[]
  /** Slider: the two ends, from the low to the high value. */
  ends?: [string, string]
  /** Slider: Swap colors turns the value around (low ↔ high). */
  negate?: boolean
  /** Key that trades places with this one when colors are swapped ("black-first" ↔ "white-first"). */
  swapKey?: string
  /** A position without its own value shows the one of the closest earlier position of the line. */
  inherit?: boolean
  /** Choice: big buttons instead of a dropdown. */
  control?: 'buttons' | 'dropdown'
  icon?: string
  hint?: string
}

export interface TagRegistry {
  tags: TagDef[]
}

/** Types offered when a new key is created in the editor. */
export const NEW_KEY_TYPES: [TagType, string][] = [
  ['text', 'Text'],
  ['list', 'List of texts'],
  ['number', 'Number'],
  ['flag', 'Yes / no'],
  ['choice', 'One of several options'],
  ['multi', 'Several options'],
  ['color', 'Black / White'],
  ['rank', 'Rank (15k, 2d…)'],
  ['slider', 'Balance (White … Black)'],
]

let current: TagRegistry = { tags: [] }
const listeners: ((r: TagRegistry) => void)[] = []
export const getRegistry = () => current
export function setRegistry(r: TagRegistry) {
  current = r
  for (const f of listeners) f(r)
}
export const onRegistry = (f: (r: TagRegistry) => void) => listeners.push(f)

export const defOf = (key: string): TagDef | undefined => current.tags.find((d) => d.key === key)

export function parseRegistry(text: string): TagRegistry {
  const j = JSON.parse(text) as Partial<TagRegistry>
  return { tags: Array.isArray(j.tags) ? j.tags : [] }
}
export const writeRegistry = (r: TagRegistry) => JSON.stringify(r, null, 2) + '\n'

/** "eye-space" → "Eye space". */
export const humanKey = (key: string) => {
  const s = key.replace(/[-_]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const labelOf = (key: string) => defOf(key)?.label ?? humanKey(key)

/** The type of a key: from its description, else from the value itself. */
export function typeOf(key: string, value?: TagValue): TagType {
  const d = defOf(key)
  if (d) return d.type
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'flag'
  if (Array.isArray(value)) return 'list'
  return 'text'
}

/** Types whose value is a list of texts. */
export const isListType = (t: TagType) => t === 'list' || t === 'multi' || t === 'board'

/** A value as a list of texts (for display and lists). */
export const asList = (v: TagValue | undefined): string[] =>
  v === undefined || v === null || v === '' || v === false ? [] : Array.isArray(v) ? v.map(String) : v === true ? ['yes'] : [String(v)]

/** The first text of a value. */
export const asText = (v: TagValue | undefined): string => asList(v)[0] ?? ''

/** Turns what was typed or picked into the value stored for this key; null removes the key. */
export function toValue(key: string, raw: string | string[] | number | boolean | null, type = typeOf(key)): TagValue | null {
  if (raw === null) return null
  if (type === 'flag') return raw === true || raw === 'yes' || raw === '1' || raw === 'true' ? true : null
  if (type === 'number' || type === 'slider') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
    return String(raw).trim() === '' || !Number.isFinite(n) ? null : n
  }
  if (isListType(type)) {
    const list = (Array.isArray(raw) ? raw : String(raw).split(',')).map((x) => String(x).trim()).filter(Boolean)
    return list.length ? list : null
  }
  const s = (Array.isArray(raw) ? raw[0] ?? '' : String(raw)).trim()
  return s ? s : null
}

/** Order of keys on screen: described keys in the order of db/tags.json, then the others alphabetically. */
export function sortKeys(keys: Iterable<string>): string[] {
  const order = current.tags.map((d) => d.key)
  return [...new Set(keys)].sort((a, b) => (order.indexOf(a) + 1 || 1e4) - (order.indexOf(b) + 1 || 1e4) || a.localeCompare(b))
}

/* ---- Swap colors ---- */

/** True when Swap colors changes this key's value. */
export function swapsValue(key: string): boolean {
  const d = defOf(key)
  return !!d && (d.type === 'color' || (d.type === 'slider' && !!d.negate) || !!d.options?.some((o) => o.swap))
}

/** The value seen with colors swapped. */
export function swapValue(key: string, v: TagValue): TagValue {
  const d = defOf(key)
  if (!d) return v
  if (Array.isArray(v)) return v.map((x) => swapText(d, x))
  if (d.type === 'slider' && d.negate && typeof v === 'number') return -v + 0
  return typeof v === 'string' ? swapText(d, v) : v
}
function swapText(d: TagDef, v: string): string {
  if (d.type === 'color') return v === 'B' ? 'W' : v === 'W' ? 'B' : v
  return d.options?.find((o) => o.value === v)?.swap ?? v
}

/** The key shown in this place when colors are swapped ("black-first" ↔ "white-first"). */
export const swapKeyOf = (key: string) => defOf(key)?.swapKey ?? key

/** "Label: description" of a key or one of its values, for a tooltip. */
export function describe(key: string, value?: string): string {
  const d = defOf(key)
  if (value === undefined) return d?.description ? `${labelOf(key)}: ${d.description}` : labelOf(key)
  const o = d?.options?.find((x) => x.value === value)
  return o?.description ? `${o.label}: ${o.description}` : valueLabel(key, value)
}

/**
 * Levels of a balance (a slider from -1 to 1 between two players): where each level starts, and its words.
 * |v| below the first is even.
 */
export const BALANCE_LEVELS: [number, string][] = [[0.1, 'Slightly better for'], [0.3, 'Better for'], [0.55, 'Much better for'], [0.85, 'Winning for']]

/** "Better for Black", "Even"…: a balance value in words; the player comes from the slider's ends ("White better"). */
export function balanceText(key: string, v: number): string {
  const ends = defOf(key)?.ends ?? ['Left', 'Right']
  const level = [...BALANCE_LEVELS].reverse().find(([at]) => Math.abs(v) >= at - 1e-9)
  if (!level) return 'Even'
  const side = (v > 0 ? ends[1] : ends[0]).split(' ')[0]
  return `${level[1]} ${side}`
}

/** Display text of one stored value. */
export function valueLabel(key: string, v: string): string {
  const d = defOf(key)
  if (d?.type === 'color') return v === 'B' ? 'Black' : v === 'W' ? 'White' : 'Neither'
  const o = d?.options?.find((x) => x.value === v)
  return o ? o.label : v
}
