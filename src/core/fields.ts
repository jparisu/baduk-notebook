/** SGF property schema (SPEC §4) and display metadata for its values. */

export type Props = Record<string, string[]>

/** Properties that describe the move itself (stored on the edge). Everything else describes the position. */
export const MOVE_PROPS = new Set(['B', 'W', 'XCAT', 'XSTY', 'XPUR', 'XCOND', 'XMW', 'XMN', 'XLINK', 'TE', 'BM', 'DO', 'IT'])
/** Entry properties (root node only). */
export const ENTRY_PROPS = new Set([
  'XID', 'XTYPE', 'XNAME', 'XALIAS', 'XDIFF', 'XTAG', 'XSUM', 'XSRC', 'XFAM', 'XERA', 'XSTART',
  'XSIZE', 'XLOC', 'XSURR', 'XOLIB', 'XINSIDE', 'XARR', 'XRESB', 'XRESW', 'XVITAL', 'XKOT', 'XRULE', 'XREG',
])
/** Free-text fields: every database's value is shown (SPEC §3.3). */
export const TEXT_PROPS = new Set(['XMW', 'XMN', 'XPW', 'XPN', 'XAJI', 'XTEN', 'XRES', 'XSUM', 'XRULE', 'C'])
/** List fields: values from all databases are joined. */
export const LIST_PROPS = new Set(['XALIAS', 'XTAG', 'XSRC', 'XPUR', 'XCOND', 'XERA', 'XVITAL'])

export type Category =
  | 'main' | 'alt' | 'situational' | 'slack' | 'mistake' | 'overplay' | 'trick' | 'punish'
  | 'correct' | 'ko' | 'wrong'

export interface CategoryInfo {
  label: string
  color: string
  symbol: string
  ink: string
  ring?: boolean
  /** Counts as a right answer (quiz, "correct move" proposals). */
  good: boolean
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  main: { label: 'Main joseki', color: '#1e9e4a', symbol: '●', ink: '#fff', good: true },
  alt: { label: 'Alternative', color: '#138f8c', symbol: '●', ink: '#fff', good: true },
  situational: { label: 'Situational', color: '#e0b000', symbol: '◆', ink: '#222', good: true },
  slack: { label: 'Slack / passive', color: '#7d858f', symbol: '▼', ink: '#fff', good: false },
  mistake: { label: 'Mistake', color: '#d33232', symbol: '✕', ink: '#fff', good: false },
  overplay: { label: 'Overplay', color: '#e8741c', symbol: '!', ink: '#fff', good: false },
  trick: { label: 'Trick play', color: '#8b47d6', symbol: '?', ink: '#fff', good: false },
  punish: { label: 'Punishment', color: '#2563eb', symbol: '', ink: '#2563eb', ring: true, good: true },
  correct: { label: 'Correct', color: '#1e9e4a', symbol: '●', ink: '#fff', good: true },
  ko: { label: 'Leads to ko', color: '#0891b2', symbol: 'K', ink: '#fff', good: false },
  wrong: { label: 'Wrong', color: '#d33232', symbol: '✕', ink: '#fff', good: false },
}
export const JOSEKI_CATEGORIES: Category[] = ['main', 'alt', 'situational', 'slack', 'mistake', 'overplay', 'trick', 'punish']
export const SHAPE_CATEGORIES: Category[] = ['correct', 'ko', 'wrong']
/** Order of next moves: best first. */
export const CATEGORY_ORDER: Category[] = ['main', 'correct', 'alt', 'punish', 'situational', 'ko', 'slack', 'trick', 'overplay', 'mistake', 'wrong']

/** Category from XCAT, falling back to standard SGF marks. */
export function categoryOf(p: Props): Category | null {
  const c = p.XCAT?.[0] as Category | undefined
  if (c && c in CATEGORIES) return c
  if (p.TE) return 'main'
  if (p.BM) return 'mistake'
  if (p.DO) return 'slack'
  if (p.IT) return 'situational'
  return null
}

export const EVAL_LABELS: Record<string, string> = {
  'B++': 'Black clearly better',
  'B+': 'Black slightly better',
  '=': 'Even',
  'W+': 'White slightly better',
  'W++': 'White clearly better',
}
export const STATUS_LABELS: Record<string, string> = {
  start: 'Start position',
  progress: 'In progress',
  end: 'Joseki end',
  'end-mistake': 'End after a mistake',
}
export const SHAPE_STATUS_LABELS: Record<string, string> = {
  alive: 'Alive', dead: 'Dead', ko: 'Ko', seki: 'Seki', unsettled: 'Unsettled',
}

/** Flips color-dependent values when the display swaps colors. */
export function flipValue(prop: string, v: string): string {
  if (prop === 'XEV') return v.replace(/^B/, '§').replace(/^W/, 'B').replace(/^§/, 'W')
  if (prop === 'XSEN') return v === 'B' ? 'W' : v === 'W' ? 'B' : v
  if (prop === 'XPB') {
    const n = Number(v)
    return Number.isFinite(n) ? String(-n) : v
  }
  if (prop === 'XRESB') return v
  return v
}
export const COLOR_PROPS = new Set(['XEV', 'XSEN', 'XPB'])
