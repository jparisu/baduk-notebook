/** Settings dialog (SPEC §8.8). */
import { CATEGORIES, MOVE_CATEGORIES, type Category } from '../core/kinds'
import { DEFAULT_SETTINGS, type Settings, type Theme } from '../settings'
import type { DatabaseInfo } from '../data/load'

const THEMES: [Theme, string, string][] = [
  ['modern', 'Modern', 'Rounded cards, soft depth, indigo accent'],
  ['simple', 'Simple', 'Calm neutral colors, classic board'],
  ['minimal', 'Minimalist', 'Black and white, flat, square'],
]

export function SettingsDialog({ s, set, close, databases, active, toggleDb }: {
  s: Settings
  set: (s: Settings) => void
  close: () => void
  databases: DatabaseInfo[]
  active: Set<string>
  toggleDb: (id: string) => void
}) {
  const up = <K extends keyof Settings>(k: K, v: Settings[K]) => set({ ...s, [k]: v })
  const toggleCat = (c: Category) =>
    up('hiddenCategories', s.hiddenCategories.includes(c) ? s.hiddenCategories.filter((x) => x !== c) : [...s.hiddenCategories, c])
  const sel = <K extends keyof Settings>(k: K, label: string, opts: [Settings[K], string][]) => (
    <label class="f">
      <span class="fl">{label}</span>
      <select value={String(s[k])} onChange={(e) => up(k, opts.find(([v]) => String(v) === (e.target as HTMLSelectElement).value)![0])}>
        {opts.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
      </select>
    </label>
  )
  return (
    <div class="modal" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="box" role="dialog" aria-label="Settings">
        <div class="box-head">
          <h2>Settings</h2>
          <button class="ghost" onClick={close} aria-label="Close settings">✕</button>
        </div>
        <h3>Appearance</h3>
        <div class="theme-pick">
          {THEMES.map(([id, name, desc]) => (
            <button key={id} class={`theme-card ${s.theme === id ? 'on' : ''}`} data-preview={id} onClick={() => up('theme', id)} aria-pressed={s.theme === id}>
              <span class="theme-swatch" aria-hidden><i /><i /><i /></span>
              <b>{name}</b>
              <small>{desc}</small>
            </button>
          ))}
        </div>
        <div class="seg mode-pick" role="group" aria-label="Light or dark">
          {(['auto', 'light', 'dark'] as const).map((m) => (
            <button key={m} class={s.colorMode === m ? 'on' : ''} onClick={() => up('colorMode', m)}>{{ auto: 'Auto', light: 'Light', dark: 'Dark' }[m]}</button>
          ))}
        </div>
        <h3>Databases</h3>
        {databases.map((d) => (
          <label key={d.id} class="cat-row db-row">
            <input type="checkbox" checked={active.has(d.id)} onChange={() => toggleDb(d.id)} />
            <input type="color" class="db-color" value={s.dbColors?.[d.id] ?? d.color} title="Your color for this database (only in this browser)" aria-label={`Color of ${d.name}`} onInput={(e) => up('dbColors', { ...(s.dbColors ?? {}), [d.id]: (e.target as HTMLInputElement).value })} />
            <span><b>{d.name}</b> <small class="hint">{d.description}</small></span>
          </label>
        ))}
        {Object.keys(s.dbColors ?? {}).length > 0 && <button class="link small" onClick={() => up('dbColors', {})}>Use the databases' own colors</button>}
        <p class="hint">Moves and titles from a database are underlined in its color. Give several databases the same color to stop telling them apart.</p>
        <h3>Next-move categories</h3>
        <div class="cat-grid">
          {MOVE_CATEGORIES.map((c) => (
            <label key={c} class="cat-row">
              <input type="checkbox" checked={!s.hiddenCategories.includes(c)} onChange={() => toggleCat(c)} />
              <span class={`dot ${CATEGORIES[c].ring ? 'ring' : ''}`} style={{ background: CATEGORIES[c].color, borderColor: CATEGORIES[c].color }} />
              {CATEGORIES[c].label}
            </label>
          ))}
        </div>
        <h3>Tags shown</h3>
        <p class="hint">Choose which tags Explore shows in the <b>Tags</b> tab.</p>
        <h3>Board</h3>
        {sel('view', 'Default view', [['corner', 'Corner (10×10)'], ['full', 'Full board']])}
        {sel('coordinates', 'Coordinates', [[true, 'Shown'], [false, 'Hidden']])}
        {sel('moveNumbers', 'Move numbers', [[false, 'Off'], [true, 'On']])}
        {sel('showNext', 'Next moves on the board', [[true, 'Shown'], [false, 'Hidden']])}
        {sel('overlays', 'Walls, areas and other drawings', [[true, 'Shown'], [false, 'Hidden']])}
        <h3>Messages</h3>
        {sel('history', 'Show messages from', [['current', 'Current move only'], ['last3', 'Current + 3 previous moves'], ['line', 'Whole line']])}
        {sel('aids', 'Visual aids in text', [['hover', 'Hover, or click/tap to keep'], ['click', 'Click or tap only'], ['always', 'Always, one color each']])}
        {sel('icons', 'Icons', [[true, 'Shown'], [false, 'Hidden']])}
        <h3>Orientation</h3>
        {sel('rememberTransform', 'Remember corner / mirror / colors', [[true, 'Yes'], [false, 'No']])}
        <h3>Quiz</h3>
        {sel('quizRandom', 'Random orientation for each card', [[true, 'Yes'], [false, 'No']])}
        {sel('quizNewPerDay', 'New cards per day', [[5, '5'], [10, '10'], [20, '20'], [50, '50']])}
        <div class="actions">
          <button onClick={() => set({ ...DEFAULT_SETTINGS, activeDatabases: s.activeDatabases })}>Reset to defaults</button>
          <button class="on" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}
