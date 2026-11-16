/** User settings (SPEC §8.8). Defaults equal the mock-up behavior. Saved in localStorage. */
import type { Category } from './core/fields'
import type { DisplayOptions } from './core/geometry'

export interface Settings {
  view: 'corner' | 'full'
  coordinates: boolean
  moveNumbers: boolean
  showNext: boolean
  hiddenCategories: Category[]
  overlays: boolean
  history: 'current' | 'last3' | 'line'
  aids: 'hover' | 'always'
  moveMessage: 'board' | 'panel'
  icons: boolean
  rememberTransform: boolean
  display: DisplayOptions
  activeDatabases: string[] | null // null = use activeByDefault from db/index.json
}

export const DEFAULT_SETTINGS: Settings = {
  view: 'corner',
  coordinates: true,
  moveNumbers: false,
  showNext: true,
  hiddenCategories: [],
  overlays: true,
  history: 'current',
  aids: 'hover',
  moveMessage: 'board',
  icons: true,
  rememberTransform: true,
  display: { corner: 'tr', mirror: false, swap: false },
  activeDatabases: null,
}

const KEY = 'baduk-notebook.settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    /* storage unavailable: use defaults */
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: Settings) {
  try {
    const toSave = s.rememberTransform ? s : { ...s, display: DEFAULT_SETTINGS.display }
    localStorage.setItem(KEY, JSON.stringify(toSave))
  } catch {
    /* ignore */
  }
}
