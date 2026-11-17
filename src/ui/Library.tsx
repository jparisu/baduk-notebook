/**
 * Library (docs/MODEL.md §5): every sequence as a tree that follows the ids (joseki › 4-4 point ›
 * 3-3 invasion), with search by name, nested tags (favourites first) and a difficulty filter.
 */
import { useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { ChevronRight, Star, X } from 'lucide-preact'
import type { Entry } from '../core/graph'
import { entryFields, rootStep, type Ctx } from '../view'
import { seqName } from '../core/model'
import { storageKey } from '../storage'

const RANK = (r: string) => {
  const m = r.match(/^(\d+)([kd])$/)
  return m ? (m[2] === 'k' ? -Number(m[1]) : Number(m[1]) - 1) : 0
}

interface Item {
  e: Entry
  name: string
  diff: string
  fam: string[]
  tags: string[]
  /** A joseki whose first move is a mistake, overplay or trick ("mistake joseki", shown in red). */
  mistake: boolean
}

/** True when the move into the start of the sequence is not a good move. */
export const isMistakeEntry = (e: Entry) => e.mistake

/** A tag matches itself and every deeper tag: "life & death" matches "life & death/corner". */
export const tagMatches = (have: string[], want: string) => have.some((t) => t === want || t.startsWith(want + '/'))

const STAR_KEY = storageKey('baduk-notebook.tags.starred')
function loadStars(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STAR_KEY) ?? '[]')
  } catch {
    return []
  }
}

interface Node {
  key: string
  name: string
  item: Item | null // the entry that is this family itself (e.g. "4-4 point")
  children: Node[]
  count: number
}

function buildTree(items: Item[]): Node[] {
  const root: Node = { key: '', name: '', item: null, children: [], count: 0 }
  for (const it of items) {
    let n = root
    it.fam.forEach((seg, i) => {
      const key = it.fam.slice(0, i + 1).join('/')
      let c = n.children.find((x) => x.key === key)
      if (!c) n.children.push((c = { key, name: seg, item: null, children: [], count: 0 }))
      c.count++
      n = c
    })
    if (n.item) n.children.push({ key: n.key + '#' + it.e.id, name: it.name, item: it, children: [], count: 1 })
    else n.item = it
  }
  const sort = (ns: Node[]) => {
    ns.sort((a, b) => a.name.localeCompare(b.name))
    ns.forEach((n) => sort(n.children))
  }
  sort(root.children)
  return root.children
}

export function Library(props: {
  ctx: Ctx
  entries: Entry[]
  current: string | null
  lib?: 'joseki' | 'shape'
  setLib?: (l: 'joseki' | 'shape') => void
  onOpen: (id: string) => void
  /** Tags the databases list as common (index.json). */
  commonTags?: string[]
  extra?: ComponentChildren
}) {
  const { ctx } = props
  const [query, setQuery] = useState('')
  const [maxRank, setMaxRank] = useState('any')
  const [tags, setTags] = useState<string[]>([])
  const [showTags, setShowTags] = useState(false)
  const [stars, setStars] = useState<string[]>(loadStars)
  const toggleStar = (t: string) => {
    const n = stars.includes(t) ? stars.filter((x) => x !== t) : [...stars, t]
    setStars(n)
    try {
      localStorage.setItem(STAR_KEY, JSON.stringify(n))
    } catch {
      /* ignore */
    }
  }
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [kind, setKind] = useState<'good' | 'all' | 'mistakes'>(() => {
    try {
      return (localStorage.getItem(storageKey('baduk-notebook.libkind')) as never) || 'good'
    } catch {
      return 'good'
    }
  })
  const pickKind = (k: typeof kind) => {
    setKind(k)
    try {
      localStorage.setItem(storageKey('baduk-notebook.libkind'), k)
    } catch {
      /* ignore */
    }
  }

  const all = useMemo<Item[]>(
    () =>
      props.entries
        .filter((e) => e.contribs.some((c) => ctx.active.has(c.db)))
        .map((e) => {
          const f = entryFields(ctx, e.id, rootStep(ctx, e.id))
          const name = f.one('XNAME')?.value ?? seqName(e.id)
          const fam = e.id.split('/').map((s) => s.trim()).filter(Boolean)
          return { e, name, diff: f.one('XDIFF')?.value ?? '', fam, tags: f.list('XTAG'), mistake: isMistakeEntry(e) }
        }),
    [props.entries, ctx.graph, ctx.active],
  )
  // Every tag and every shorter tag it contains ("a/b" also offers "a").
  const allTags = useMemo(() => [...new Set(all.flatMap((i) => i.tags.flatMap((t) => t.split('/').map((_, k, a) => a.slice(0, k + 1).join('/')))))].sort(), [all])
  const favourites = [...new Set([...stars, ...(props.commonTags ?? [])])].filter((t) => !tags.includes(t))
  const q = query.trim().toLowerCase()
  const filtering = !!q || tags.length > 0 || maxRank !== 'any' || kind === 'mistakes'
  const items = all
    .filter((i) => !q || i.name.toLowerCase().includes(q) || i.fam.join(' ').toLowerCase().includes(q))
    .filter((i) => tags.every((t) => tagMatches([...i.tags, i.e.id], t))) // the id counts as a tag: "joseki" finds every joseki
    .filter((i) => maxRank === 'any' || !i.diff || RANK(i.diff) <= RANK(maxRank))
    .filter((i) => kind === 'all' || (kind === 'good' ? !i.mistake : i.mistake) || i.e.id === props.current)
  const tree = buildTree(items)

  // Families around the current entry start open.
  const currentFam = all.find((i) => i.e.id === props.current)?.fam ?? []
  const isOpen = (key: string) =>
    filtering || open.has(key) || (!open.has('!' + key) && currentFam.some((_, i) => currentFam.slice(0, i + 1).join('/') === key))
  const toggle = (key: string) => {
    const n = new Set(open)
    if (isOpen(key)) {
      n.delete(key)
      n.add('!' + key)
    } else {
      n.add(key)
      n.delete('!' + key)
    }
    setOpen(n)
  }

  const render = (n: Node, depth: number): ComponentChildren => {
    const hasKids = n.children.length > 0
    const opened = hasKids && isOpen(n.key)
    const cur = n.item && n.item.e.id === props.current
    return (
      <li key={n.key} class="lib-node">
        <div class={`lib-row ${cur ? 'cur' : ''}`} style={{ paddingLeft: `${depth * 14}px` }}>
          {hasKids ? (
            <button class={`twisty ${opened ? 'open' : ''}`} onClick={() => toggle(n.key)} aria-expanded={opened} aria-label={`${opened ? 'Close' : 'Open'} ${n.name}`}>
              <ChevronRight size={14} />
            </button>
          ) : (
            <span class="twisty-space" />
          )}
          {n.item ? (
            <button class={`lib-name ${n.item.mistake ? 'mistake' : ''}`} onClick={() => props.onOpen(n.item!.e.id)} title={n.item.mistake ? `${n.item.name} (starts with a mistake)` : n.item.name}>
              {n.item.mistake && <span class="mistake-dot" aria-hidden />}
              {n.name}
            </button>
          ) : (
            <button class="lib-name fam-only" onClick={() => toggle(n.key)}>{n.name}</button>
          )}
          {n.item?.diff ? <span class="k">{n.item.diff}</span> : hasKids ? <span class="k">{n.count}</span> : null}
        </div>
        {opened && <ul>{n.children.map((c) => render(c, depth + 1))}</ul>}
      </li>
    )
  }

  return (
    <div class="library">
      <input class="search" type="search" placeholder="Search by name" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} aria-label="Search by name" />
      <div class="seg kind-filter" role="group" aria-label="Which sequences">
        {(['good', 'all', 'mistakes'] as const).map((k) => (
          <button key={k} class={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => pickKind(k)} title={{ good: 'Only sequences that start with a good move', all: 'Also sequences that start with a mistake (shown in red)', mistakes: 'Only sequences that start with a mistake, overplay or trick' }[k]}>
            {{ good: 'Good only', all: 'All', mistakes: 'Mistakes' }[k]}
          </button>
        ))}
      </div>
      <div class="lib-filters">
        <select class="filter" value={maxRank} onChange={(e) => setMaxRank((e.target as HTMLSelectElement).value)} aria-label="Difficulty">
          <option value="any">Any difficulty</option>
          <option value="20k">Up to 20k</option>
          <option value="15k">Up to 15k</option>
          <option value="10k">Up to 10k</option>
          <option value="5k">Up to 5k</option>
          <option value="1k">Up to 1k</option>
        </select>
        <button class={`tags-toggle ${showTags || tags.length ? 'on' : ''}`} onClick={() => setShowTags(!showTags)} aria-expanded={showTags}>
          Tags{tags.length ? ` (${tags.length})` : ''}
        </button>
      </div>
      {tags.length > 0 && (
        <div class="tag-chips selected">
          {tags.map((t) => (
            <button key={t} class="chip on" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>{t} <X size={12} /></button>
          ))}
        </div>
      )}
      {favourites.length > 0 && (
        <div class="tag-chips fav" role="group" aria-label="Favourite tags">
          {favourites.map((t) => (
            <button key={t} class="chip" onClick={() => setTags([...tags, t])} title={stars.includes(t) ? 'Starred tag' : 'Common tag'}>
              {stars.includes(t) && <Star size={11} aria-hidden />} {t}
            </button>
          ))}
        </div>
      )}
      {showTags && (
        <div class="tag-chips" role="group" aria-label="Filter by tag">
          {allTags.filter((t) => !tags.includes(t)).map((t) => (
            <span key={t} class="chip-star">
              <button class="chip" onClick={() => setTags([...tags, t])}>{t}</button>
              <button class={`star ${stars.includes(t) ? 'on' : ''}`} aria-pressed={stars.includes(t)} aria-label={`${stars.includes(t) ? 'Unstar' : 'Star'} ${t}`} onClick={() => toggleStar(t)}><Star size={11} /></button>
            </span>
          ))}
          {allTags.length === 0 && <span class="hint">No tags yet.</span>}
        </div>
      )}
      <ul class="lib-tree">{tree.map((n) => render(n, 0))}</ul>
      {items.length === 0 && <p class="hint">No entries match.</p>}
      {props.extra}
    </div>
  )
}
