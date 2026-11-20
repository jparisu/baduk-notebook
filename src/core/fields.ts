/**
 * Properties of positions and moves inside the app. Values are described by the schema
 * (core/schema.ts, db/schema.json); this module keeps the move categories in step with it.
 */
import { fieldOf, fieldOfProp, onSchema, swapValue, swapsValue, type Schema } from './schema'

export type Props = Record<string, string[]>

/** Properties that always belong to the move (besides the move fields of the schema). */
const MOVE_BASE = new Set(['B', 'W', 'XMW', 'XMN', 'XLINK', 'TE', 'BM', 'DO', 'IT'])
/** True when a property describes the move (stored on the edge) rather than the position. */
export const isMoveProp = (prop: string) => MOVE_BASE.has(prop) || fieldOfProp(prop)?.for === 'move'
/** Free-text fields: every database's text is shown. */
export const TEXT_PROPS = new Set(['XMW', 'XPW', 'XSUM'])
/** List fields: values from all databases are joined. */
export const isListProp = (prop: string) => prop === 'XTAG' || ['list', 'multi'].includes(fieldOfProp(prop)?.type ?? '')

/** A move category ("This move is"): one option of the schema's `category` key. */
export type Category = string

export interface CategoryInfo {
  label: string
  color: string
  symbol: string
  ink: string
  ring?: boolean
  /** Counts as a right answer (quiz, main lines). */
  good: boolean
}

/** Filled from the schema; kept as the same objects so every module sees the current categories. */
export const CATEGORIES: Record<string, CategoryInfo> = {}
export const MOVE_CATEGORIES: string[] = []
/** Order of next moves: good moves first, in the schema's order. */
export const CATEGORY_ORDER: string[] = []

/** Dark or light text on a color. */
function inkOn(color: string) {
  const m = color.match(/^#([0-9a-f]{6})$/i)
  if (!m) return '#fff'
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#222' : '#fff'
}

function applySchema(_: Schema) {
  for (const k of Object.keys(CATEGORIES)) delete CATEGORIES[k]
  const opts = fieldOf('category')?.options ?? []
  for (const o of opts) {
    const color = o.color ?? '#7d858f'
    CATEGORIES[o.value] = { label: o.label, color, symbol: o.ring ? '' : o.icon ?? '●', ink: o.ring ? color : inkOn(color), ring: o.ring, good: !!o.good }
  }
  MOVE_CATEGORIES.splice(0, MOVE_CATEGORIES.length, ...opts.map((o) => o.value))
  CATEGORY_ORDER.splice(0, CATEGORY_ORDER.length, ...opts.filter((o) => o.good).map((o) => o.value), ...opts.filter((o) => !o.good).map((o) => o.value))
}
onSchema(applySchema)

/** Older values (former shape categories, imported files). */
const LEGACY: Record<string, string> = { correct: 'main', wrong: 'mistake', ko: 'situational' }

/** Category of a move, also from standard SGF marks. */
export function categoryOf(p: Props): Category | null {
  const c = p.XCAT?.[0]
  if (c && c in CATEGORIES) return c
  if (c && LEGACY[c] && LEGACY[c] in CATEGORIES) return LEGACY[c]
  if (p.TE) return 'main'
  if (p.BM) return 'mistake'
  if (p.DO) return 'slack'
  if (p.IT) return 'situational'
  return null
}

/** Values that change with Swap colors. */
export const flipValue = (prop: string, v: string) => swapValue(prop, v)
export const isColorProp = (prop: string) => swapsValue(prop)
