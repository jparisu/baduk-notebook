/** User settings (SPEC §8.8). Defaults equal the mock-up behavior. Saved in localStorage. */
import type { Category } from './core/fields'
import type { DisplayOptions } from './core/geometry'
import { storageKey } from './storage'

export type Theme = 'simple' | 'minimal' | 'modern'
export type ColorMode = 'auto' | 'light' | 'dark'

export interface Settings {
  theme: Theme
  colorMode: ColorMode
  view: 'corner' | 'full'
  coordinates: boolean
  moveNumbers: boolean
  showNext: boolean
  hiddenCategories: Category[]
  overlays: boolean
  history: 'current' | 'last3' | 'line'
  aids: 'hover' | 'click' | 'always'
  moveMessage: 'board' | 'panel'
  icons: boolean
  rememberTransform: boolean
  quizRandom: boolean
  quizNewPerDay: number
  display: DisplayOptions
  hideLeft: boolean
  treeMode: 'linear' | 'proximity' | 'complete'
  treeZoom: number
  hideRight: boolean
  activeDatabases: string[] | null // null = use activeByDefault from db/index.json
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'modern',
  colorMode: 'auto',
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
  quizRandom: true,
  quizNewPerDay: 10,
  display: { corner: 'tr', mirror: false, swap: false },
  hideLeft: false,
  treeMode: 'proximity',
  treeZoom: 1,
  hideRight: false,
  activeDatabases: null,
}

const KEY = storageKey('baduk-notebook.settings')

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

/** Applies the theme to the page (data attributes read by styles.css). */
export function applyTheme(s: Settings) {
  const root = document.documentElement
  root.dataset.style = s.theme
  root.dataset.mode = s.colorMode
}
