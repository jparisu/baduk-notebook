/** Library of entries: Joseki / Shapes tabs, search, difficulty filter, grouped by family or location. */
import { useState } from 'preact/hooks'
import type { Entry } from '../core/graph'
import { entryFields, rootStep, type Ctx } from '../view'

const RANK = (r: string) => {
  const m = r.match(/^(\d+)([kd])$/)
  return m ? (m[2] === 'k' ? -Number(m[1]) : Number(m[1]) - 1) : 0
}

export function Library(props: {
  ctx: Ctx
  entries: Entry[]
  current: string | null
  lib: 'joseki' | 'shape'
  setLib: (l: 'joseki' | 'shape') => void
  onOpen: (id: string) => void
  extra?: preact.ComponentChildren
}) {
  const { ctx } = props
  const [query, setQuery] = useState('')
  const [maxRank, setMaxRank] = useState('any')
  const items = props.entries
    .filter((e) => e.type === props.lib)
    .map((e) => {
      const f = entryFields(ctx, e.id, rootStep(ctx, e.id))
      return { e, f, name: f.one('XNAME')?.value ?? e.id, diff: f.one('XDIFF')?.value ?? '' }
    })
    .filter(({ name, f }) => !query || (name + ' ' + f.list('XTAG').join(' ')).toLowerCase().includes(query.toLowerCase()))
    .filter(({ diff }) => maxRank === 'any' || !diff || RANK(diff) <= RANK(maxRank))
    .sort((a, b) => a.name.localeCompare(b.name))
  const groups = new Map<string, typeof items>()
  for (const it of items) {
    const g = props.lib === 'joseki' ? (it.f.one('XFAM')?.value.split('/')[0] ?? 'Other') : (it.f.one('XLOC')?.value ?? 'Other')
    groups.set(g, [...(groups.get(g) ?? []), it])
  }
  return (
    <div class="library">
      <div class="seg" role="tablist">
        <button role="tab" aria-selected={props.lib === 'joseki'} class={props.lib === 'joseki' ? 'on' : ''} onClick={() => props.setLib('joseki')}>Joseki</button>
        <button role="tab" aria-selected={props.lib === 'shape'} class={props.lib === 'shape' ? 'on' : ''} onClick={() => props.setLib('shape')}>Shapes</button>
      </div>
      <input class="search" type="search" placeholder="Search by name or tag" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} aria-label="Search library" />
      <select class="filter" value={maxRank} onChange={(e) => setMaxRank((e.target as HTMLSelectElement).value)} aria-label="Difficulty">
        <option value="any">Any difficulty</option>
        <option value="20k">Up to 20k</option>
        <option value="15k">Up to 15k</option>
        <option value="10k">Up to 10k</option>
        <option value="5k">Up to 5k</option>
        <option value="1k">Up to 1k</option>
      </select>
      {[...groups].map(([g, list]) => (
        <div key={g} class="group">
          <div class="fam">{g}</div>
          {list.map(({ e, name, diff }) => (
            <button key={e.id} class={`item ${e.id === props.current ? 'cur' : ''}`} onClick={() => props.onOpen(e.id)}>
              <span>{name}</span>
              <span class="k">{diff}</span>
            </button>
          ))}
        </div>
      ))}
      {items.length === 0 && <p class="hint">No entries match.</p>}
      {props.extra}
    </div>
  )
}
