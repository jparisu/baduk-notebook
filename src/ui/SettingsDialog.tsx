/** Settings dialog (SPEC §8.8). */
import { CATEGORIES, JOSEKI_CATEGORIES, SHAPE_CATEGORIES, type Category } from '../core/fields'
import { DEFAULT_SETTINGS, type Settings } from '../settings'

export function SettingsDialog({ s, set, close }: { s: Settings; set: (s: Settings) => void; close: () => void }) {
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
        <h2>Settings</h2>
        <h3>Next-move categories</h3>
        <div class="cat-grid">
          {[...JOSEKI_CATEGORIES, ...SHAPE_CATEGORIES].map((c) => (
            <label key={c} class="cat-row">
              <input type="checkbox" checked={!s.hiddenCategories.includes(c)} onChange={() => toggleCat(c)} />
              <span class={`dot ${CATEGORIES[c].ring ? 'ring' : ''}`} style={{ background: CATEGORIES[c].color, borderColor: CATEGORIES[c].color }} />
              {CATEGORIES[c].label}
            </label>
          ))}
        </div>
        <h3>Board</h3>
        {sel('view', 'Default view', [['corner', 'Corner (10×10)'], ['full', 'Full board']])}
        {sel('coordinates', 'Coordinates', [[true, 'Shown'], [false, 'Hidden']])}
        {sel('moveNumbers', 'Move numbers', [[false, 'Off'], [true, 'On']])}
        {sel('showNext', 'Next moves on the board', [[true, 'Shown'], [false, 'Hidden']])}
        {sel('overlays', 'Walls, areas and other drawings', [[true, 'Shown'], [false, 'Hidden']])}
        <h3>Messages</h3>
        {sel('history', 'Show messages from', [['current', 'Current move only'], ['last3', 'Current + 3 previous moves'], ['line', 'Whole line']])}
        {sel('aids', 'Visual aids in text', [['hover', 'On hover or tap'], ['always', 'Always, one color each']])}
        {sel('moveMessage', '"Why this move"', [['board', 'Under the board'], ['panel', 'In the side panel']])}
        {sel('icons', 'Icons', [[true, 'Shown'], [false, 'Hidden']])}
        <h3>Orientation</h3>
        {sel('rememberTransform', 'Remember corner / mirror / colors', [[true, 'Yes'], [false, 'No']])}
        <div class="actions">
          <button onClick={() => set({ ...DEFAULT_SETTINGS, activeDatabases: s.activeDatabases })}>Reset to defaults</button>
          <button class="on" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}
