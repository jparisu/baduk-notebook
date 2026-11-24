/**
 * Move kinds: the options of the `kind` tag (the tags of the databases (db/<database>/tags.json)) — main move, alternative, mistake… They color
 * the board marks and the tree, and decide which moves count as right answers.
 */
import { asText, defOf, onRegistry, type Tags } from './tags'

/** A move kind: one option of the `kind` tag. */
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

/** Filled from the registry; kept as the same objects so every module sees the current kinds. */
export const CATEGORIES: Record<string, CategoryInfo> = {}
export const MOVE_CATEGORIES: string[] = []
/** Order of next moves: good moves first, in the registry's order. */
export const CATEGORY_ORDER: string[] = []

/** Dark or light text on a color. */
function inkOn(color: string) {
  const m = color.match(/^#([0-9a-f]{6})$/i)
  if (!m) return '#fff'
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#222' : '#fff'
}

onRegistry(() => {
  for (const k of Object.keys(CATEGORIES)) delete CATEGORIES[k]
  const opts = defOf('kind')?.options ?? []
  for (const o of opts) {
    const color = o.color ?? '#7d858f'
    CATEGORIES[o.value] = { label: o.label, color, symbol: o.ring ? '' : o.icon ?? '●', ink: o.ring ? color : inkOn(color), ring: o.ring, good: !!o.good }
  }
  MOVE_CATEGORIES.splice(0, MOVE_CATEGORIES.length, ...opts.map((o) => o.value))
  CATEGORY_ORDER.splice(0, CATEGORY_ORDER.length, ...opts.filter((o) => o.good).map((o) => o.value), ...opts.filter((o) => !o.good).map((o) => o.value))
})

/** Kind of a move, when it has one the registry knows. */
export function categoryOf(tags: Tags): Category | null {
  const c = asText(tags.kind)
  return c && c in CATEGORIES ? c : null
}
