/**
 * Tags tab (docs/MODEL.md §3.5): the tags of positions and moves.
 * - Left: every tag (described by a database, or only used in the data), with a switch for whether
 *   Explore shows it. Which tags are shown is a setting of this browser, not data.
 * - Middle: the selected tag: its name, meaning, where it applies (positions, moves or both) and its
 *   type with that type's settings (a number's range and step, the options of a choice…). It is saved
 *   into the database that receives the edits: a database defines its own tags and may add options to
 *   a tag an earlier database defines (db/<database>/tags.json).
 * - Right: how it looks in Explore, and where it is used.
 */
import type { ComponentChildren } from 'preact'
import { OptionMark } from './OptionMark'
import { useMemo, useState } from 'preact/hooks'
import { Eye, EyeOff, Plus, Search } from 'lucide-preact'
import { LINKED, asList, getRegistry, humanKey, labelOf, sortKeys, typeOf, type TagDef, type TagOption, type TagType, type TagValue } from '../core/tags'
import { dropTagDef, putTagDef, type Workspace } from '../edit/workspace'
import type { DatabaseInfo } from '../data/load'
import type { Settings } from '../settings'
import { Workbench } from './Workbench'
import { BalanceMeter, StoneIcon } from './Panels'
import { Info } from './EditPanel'

/** The types a tag can have, in the order they are offered, with what each is for. */
const TYPES: { type: TagType; name: string; icon: string; about: string }[] = [
  { type: 'text', name: 'Text', icon: 'Aa', about: 'Any words' },
  { type: 'list', name: 'List of texts', icon: '☰', about: 'Several words, like names or topics' },
  { type: 'number', name: 'Number', icon: '#', about: 'A number, with a range and a step' },
  { type: 'flag', name: 'Yes / no', icon: '✓', about: 'On or off' },
  { type: 'choice', name: 'One option', icon: '◉', about: 'One of a list of options with icons and colors' },
  { type: 'multi', name: 'Several options', icon: '☑', about: 'Any of a list of options' },
  { type: 'color', name: 'Black / White', icon: '◐', about: 'A player (follows Swap colors)' },
  { type: 'point', name: 'Board point', icon: '⌖', about: 'A point such as Q16 (follows the board orientation)' },
  { type: 'rank', name: 'Rank', icon: '★', about: 'A rank such as 15k or 2d' },
  { type: 'slider', name: 'Balance', icon: '⚖', about: 'Between two sides, shown as a meter with levels' },
  { type: 'board', name: 'Board shapes', icon: '△', about: 'Marks drawn on the board' },
]
const typeName = (t: TagType) => TYPES.find((x) => x.type === t)?.name ?? t

type Domain = 'position' | 'move' | 'both'
const domainOf = (d: TagDef | undefined): Domain => (d?.for === 'position' ? 'position' : d?.for === 'move' ? 'move' : 'both')
const DOMAIN_NAMES: Record<Domain, string> = { position: 'Positions', move: 'Moves', both: 'Both' }

const KEY_RE = /^[a-z0-9][a-z0-9-]*$/
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

interface Usage {
  positions: number
  moves: number
  /** Ids of a few positions that use it (on the position or on a move from it). */
  examples: string[]
  /** A value seen in the data, for the preview. */
  sample?: TagValue
}

function usageOf(ws: Workspace): Map<string, Usage> {
  const out = new Map<string, Usage>()
  const at = (k: string) => out.get(k) ?? (out.set(k, { positions: 0, moves: 0, examples: [] }), out.get(k)!)
  for (const f of ws.files)
    for (const p of f.positions) {
      for (const [k, v] of Object.entries(p.tags)) {
        const u = at(k)
        u.positions++
        if (u.examples.length < 4) u.examples.push(p.id)
        u.sample ??= v
      }
      for (const m of p.moves)
        for (const [k, v] of Object.entries(m.tags)) {
          const u = at(k)
          u.moves++
          if (u.examples.length < 4 && !u.examples.includes(p.id)) u.examples.push(p.id)
          u.sample ??= v
        }
    }
  return out
}

export function TagsMode(p: {
  ws: Workspace
  databases: DatabaseInfo[]
  target: string
  setTarget: (db: string) => void
  settings: Settings
  setSettings: (s: Settings) => void
  commit: (msg?: string) => void
  dbColor: (db: string) => string
  phone: boolean
  /** Changes to the workspace (redraws the lists after a save). */
  version: number
}) {
  const reg = getRegistry().tags
  const usage = useMemo(() => usageOf(p.ws), [p.ws, p.version])
  const described = new Set(reg.map((d) => d.key))
  const allKeys = sortKeys([...reg.map((d) => d.key), ...usage.keys()])
  const [selected, setSelected] = useState<string | null>(allKeys[0] ?? null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState<Domain | 'all'>('all')

  const hidden = new Set(p.settings.hiddenKeys ?? [])
  const setHidden = (keys: string[]) => p.setSettings({ ...p.settings, hiddenKeys: keys })
  const toggle = (k: string) => setHidden(hidden.has(k) ? [...hidden].filter((x) => x !== k) : [...hidden, k])

  const q = query.trim().toLowerCase()
  const shownInList = allKeys.filter((k) => {
    const d = reg.find((x) => x.key === k)
    // Positions and Moves include the tags for both; Both shows only those.
    if (domain === 'both' ? domainOf(d) !== 'both' : domain !== 'all' && domainOf(d) !== domain && domainOf(d) !== 'both') return false
    return !q || k.includes(q) || labelOf(k).toLowerCase().includes(q)
  })
  const visibleCount = allKeys.filter((k) => !hidden.has(k)).length

  const list = (
    <aside class="pane left tags-list" aria-label="Tags">
      <div class="tags-list-head">
        <h2>Tags</h2>
        <button class="on" onClick={() => { setCreating(true); setSelected(null) }}><Plus size={14} /> New tag</button>
      </div>
      <div class="tags-visibility">
        <span>Shown in Explore: <b>{visibleCount}</b> of {allKeys.length}<Info text="Which tags the Explore panels show. This is a setting of this browser; the editor still shows every tag." /></span>
        <span class="grp">
          <button onClick={() => setHidden([])} disabled={visibleCount === allKeys.length}>Show all</button>
          <button onClick={() => setHidden(allKeys)} disabled={visibleCount === 0}>Show none</button>
        </span>
      </div>
      <label class="tags-search"><Search size={14} /><input type="search" placeholder="Search tags" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} aria-label="Search tags" /></label>
      <div class="seg" role="group" aria-label="Applies to">
        {(['all', 'position', 'move', 'both'] as const).map((d) => (
          <button key={d} class={domain === d ? 'on' : ''} aria-pressed={domain === d} onClick={() => setDomain(d)}>{d === 'all' ? 'All' : DOMAIN_NAMES[d]}</button>
        ))}
      </div>
      <ul class="tag-cards" role="listbox" aria-label="Tags">
        {shownInList.map((k) => {
          const d = reg.find((x) => x.key === k)
          const u = usage.get(k)
          const t = d?.type ?? typeOf(k, u?.sample)
          const on = !hidden.has(k)
          return (
            <li key={k} role="option" aria-selected={selected === k && !creating} class={`tag-card ${selected === k && !creating ? 'sel' : ''} ${on ? '' : 'off'}`}>
              <button class="tag-card-main" onClick={() => { setSelected(k); setCreating(false) }}>
                <span class="tag-icon" aria-hidden>{d?.icon ?? TYPES.find((x) => x.type === t)?.icon ?? '•'}</span>
                <span class="tag-card-text">
                  <b>{labelOf(k)}</b>
                  <small>{typeName(t)} · {DOMAIN_NAMES[domainOf(d)]}{d ? '' : ' · not described'}{d?.like ? ` · like ${labelOf(d.like)}` : ''}</small>
                </span>
                {d?.db && <span class="db-dot" style={{ background: p.dbColor(d.db) }} title={`Defined in ${d.db}`} />}
                {u && <small class="uses" title={`Used on ${u.positions} positions and ${u.moves} moves`}>{u.positions + u.moves}</small>}
              </button>
              <button class={`icon ghost eye ${on ? 'shown' : ''}`} aria-pressed={on} aria-label={`${on ? 'Hide' : 'Show'} ${labelOf(k)} in Explore`} title={`${on ? 'Shown' : 'Hidden'} in Explore`} onClick={() => toggle(k)}>
                {on ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </li>
          )
        })}
        {!shownInList.length && <li class="hint">No tag matches.</li>}
      </ul>
    </aside>
  )

  const def = selected ? reg.find((d) => d.key === selected) : undefined
  const open = (k: string) => { setSelected(k); setCreating(false) }
  // A tag opens in the database that defines it; "Into" can pick another one (to add options there).
  const [intoFor, setIntoFor] = useState<Record<string, string>>({})
  const into = (selected && !creating ? intoFor[selected] ?? def?.db : null) ?? p.target
  const setInto = (db: string) => (selected && !creating ? setIntoFor({ ...intoFor, [selected]: db }) : p.setTarget(db))
  const ep = { ...p, target: into, setTarget: setInto }
  const editor = (
    <main class="pane center tag-editor-pane">
      {creating ? (
        <TagEditor key={'new' + into} mode="new" base={{ key: '', label: '', type: 'text' }} {...ep} existing={allKeys} onOpen={open}
          onSaved={(k) => { setCreating(false); setSelected(k) }} />
      ) : selected && def ? (
        <TagEditor key={selected + into + p.version} mode={def.db === into ? 'own' : 'extend'} base={def} {...ep} existing={allKeys} onSaved={setSelected} onOpen={open}
          onDeleted={() => setSelected(null)} />
      ) : selected ? (
        <TagEditor key={selected + into} mode="describe" base={{ key: selected, label: humanKey(selected), type: typeOf(selected, usage.get(selected)?.sample) }} {...ep} existing={allKeys} onSaved={setSelected} onOpen={open} />
      ) : (
        <p class="hint">Pick a tag on the left, or make a new one.</p>
      )}
    </main>
  )

  const preview = (
    <aside class="pane right tag-preview" aria-label="Preview">
      {selected && !creating ? (
        <>
          <h2>In Explore</h2>
          <Preview def={def} k={selected} sample={usage.get(selected)?.sample} hidden={hidden.has(selected)} />
          <h2>Used on</h2>
          {usage.get(selected) ? (
            <>
              <p class="uses-line"><b>{usage.get(selected)!.positions}</b> positions · <b>{usage.get(selected)!.moves}</b> moves</p>
              <ul class="examples">{usage.get(selected)!.examples.map((id) => <li key={id}><code>{id}</code></li>)}</ul>
            </>
          ) : (
            <p class="hint">Not used yet.</p>
          )}
        </>
      ) : (
        <p class="hint">The preview shows here.</p>
      )}
    </aside>
  )

  if (p.phone) return <>{list}{editor}{preview}</>
  return (
    <Workbench
      id="tags"
      cols={[
        { id: 'list', name: 'tags list', label: 'Tags', width: 330, min: 260, max: 520, node: list },
        { id: 'editor', node: editor },
        { id: 'preview', name: 'preview', label: 'Preview', width: 300, min: 220, max: 480, node: preview },
      ]}
    />
  )
}

/** How a tag looks in the Explore panels, with a value from the data (or an example one). */
function Preview({ def, k, sample, hidden }: { def: TagDef | undefined; k: string; sample?: TagValue; hidden: boolean }) {
  const t = def?.type ?? typeOf(k, sample)
  let value: ComponentChildren
  switch (t) {
    case 'slider':
      return <div class={`preview-card ${hidden ? 'off' : ''}`}><BalanceMeter k={k} v={typeof sample === 'number' ? sample : 0.4} /></div>
    case 'color':
      value = <><StoneIcon sign={sample === 'W' ? -1 : 1} size={14} /> {sample === 'W' ? 'White' : 'Black'}</>
      break
    case 'flag':
      value = 'Yes'
      break
    case 'number':
      value = `${typeof sample === 'number' ? sample : def?.min ?? 0}${def?.unit ? ' ' + def.unit : ''}`
      break
    case 'choice':
    case 'multi': {
      const vals = sample !== undefined ? asList(sample) : (def?.options ?? []).slice(0, t === 'multi' ? 2 : 1).map((o) => o.value)
      value = vals.map((v) => {
        const o = def?.options?.find((x) => x.value === v)
        return <span key={v} class="value"><OptionMark o={o} />{o?.label ?? v}</span>
      })
      break
    }
    case 'point':
      value = typeof sample === 'string' ? sample : 'Q16'
      break
    case 'rank':
      value = typeof sample === 'string' ? sample : '15k'
      break
    case 'board':
      value = <span class="hint">Drawn on the board</span>
      break
    default:
      value = sample !== undefined ? asList(sample).join(', ') : 'Example text'
  }
  return (
    <div class={`preview-card ${hidden ? 'off' : ''}`} title={hidden ? 'Hidden in Explore' : undefined}>
      <div class="kvs"><div class="f"><div class="fl">{def?.label ?? labelOf(k)}</div><div class="fv"><span class="values">{value}</span></div></div></div>
      {hidden && <small class="hint">Hidden in Explore</small>}
    </div>
  )
}

/** A labelled part of the tag editor. */
function Field({ label, info, children }: { label: string; info?: string; children: ComponentChildren }) {
  return (
    <div class="tag-row te-field">
      <div class="tag-row-head"><span class="tag-name">{label}</span>{info && <Info text={info} />}</div>
      <div class="tag-control">{children}</div>
    </div>
  )
}

/**
 * Edits one tag:
 * - "own": defined by the database that receives the edits: everything can change;
 * - "extend": defined by another database: the edits database can only add options to it;
 * - "describe": a key only used in the data: describe it in the edits database;
 * - "new": a new tag.
 */
function TagEditor(p: {
  mode: 'own' | 'extend' | 'describe' | 'new'
  base: TagDef
  ws: Workspace
  databases: DatabaseInfo[]
  target: string
  setTarget: (db: string) => void
  commit: (msg?: string) => void
  dbColor: (db: string) => string
  existing: string[]
  onSaved: (key: string) => void
  onDeleted?: () => void
  /** Opens another tag in the editor (the one a linked tag uses). */
  onOpen: (key: string) => void
}) {
  const [d, setD] = useState<TagDef>(() => JSON.parse(JSON.stringify(p.base)))
  const [error, setError] = useState<string | null>(null)
  const locked = p.mode === 'extend'
  const upd = (patch: Partial<TagDef>) => setD({ ...d, ...patch })
  const opts = d.options ?? []
  /** Options this database stores (the others come from other databases and stay as they are). */
  const mine = (o: TagOption) => !d.like && (!o.db || o.db === p.target)
  const updOpt = (i: number, patch: Partial<TagOption>) => upd({ options: opts.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const moveOpt = (i: number, by: number) => {
    const j = i + by
    if (j < 0 || j >= opts.length) return
    const out = [...opts]
    ;[out[i], out[j]] = [out[j], out[i]]
    upd({ options: out })
  }
  const domain = domainOf(d)
  const hasOptions = d.type === 'choice' || d.type === 'multi'
  // A linked tag takes its settings from another tag (`like`): they are shown, not edited, here.
  const all = getRegistry().tags
  const source = d.like ? all.find((x) => x.key === d.like) : undefined
  const fixed = locked || !!d.like
  const usedBy = all.filter((x) => x.like === d.key && x.key !== d.key)
  /** Tags whose settings this one can use: not itself, and not one that is linked to it. */
  const linkable = all.filter((x) => x.key !== d.key && x.like !== d.key && x.type !== 'board')
  const link = (key: string) => {
    if (!key) return upd({ like: undefined })
    const src = all.find((x) => x.key === key)!
    const copy: Partial<TagDef> = { like: key }
    for (const k of LINKED) (copy as Record<string, unknown>)[k] = (src as unknown as Record<string, unknown>)[k]
    upd(copy)
  }

  const save = () => {
    const key = p.mode === 'new' ? (d.key || slug(d.label)) : d.key
    if (!d.label.trim()) return setError('Give the tag a name.')
    if (!KEY_RE.test(key)) return setError('The key uses lowercase letters, digits and hyphens.')
    if (p.mode === 'new' && p.existing.includes(key)) return setError(`There is already a tag "${key}".`)
    if (hasOptions && !opts.length && !d.like) return setError('Add at least one option.')
    const values = opts.map((o) => o.value)
    if (opts.some((o) => !o.value || !o.label)) return setError('Every option needs a name.')
    if (new Set(values).size !== values.length) return setError('Two options have the same value.')
    if (d.type === 'number' && d.min !== undefined && d.max !== undefined && d.min > d.max) return setError('The smallest value is larger than the largest.')
    if (locked) {
      // Only the options this database adds are stored in it; the rest stays in the database that defines the tag.
      const added = opts.filter((o) => !o.db || o.db === p.target).map(({ db: _db, ...o }) => (void _db, o))
      const own = p.ws.tags[p.target]?.tags.find((x) => x.key === key)
      if (!added.length && !own) return setError('Add an option first: this database can only add options to this tag.')
      if (added.length) putTagDef(p.ws, p.target, { key, label: d.label, type: d.type, options: added })
      else dropTagDef(p.ws, p.target, key)
    } else {
      const out: TagDef = { ...d, key, label: d.label.trim(), options: opts.filter(mine) }
      if (!hasOptions) delete out.options
      if (out.type !== 'number') for (const k of ['min', 'max', 'step', 'unit'] as const) delete out[k]
      if (out.type !== 'slider') { delete out.ends; delete out.negate }
      if (out.type !== 'choice') delete out.control
      // A linked tag stores only the link; its settings are read from the other tag.
      if (out.like) for (const k of LINKED) if (k !== 'type') delete out[k]
      putTagDef(p.ws, p.target, out)
    }
    setError(null)
    p.commit(`Tag "${d.label}" saved in ${p.target} (in this browser; Export proposes it)`)
    p.onSaved(key)
  }
  const remove = () => {
    dropTagDef(p.ws, p.target, d.key)
    p.commit(`Tag "${d.label}" removed from ${p.target}`)
    p.onDeleted?.()
  }

  return (
    <div class="tag-editor">
      <div class="te-head">
        <span class="tag-icon big" aria-hidden>{d.icon ?? TYPES.find((x) => x.type === d.type)?.icon}</span>
        <div>
          <h2>{p.mode === 'new' ? 'New tag' : d.label || d.key}</h2>
          <small class="hint">
            {p.mode === 'new' ? `Into ${p.target}` : p.mode === 'describe' ? 'Used in the data, not described yet' : <>Defined in <b style={{ color: p.dbColor(p.base.db ?? '') }}>{p.base.db}</b>{locked && <> · {p.target} can add options</>}</>}
          </small>
        </div>
        <span class="spacer" />
        <label class="te-into">
          Into
          <select value={p.target} onChange={(e) => p.setTarget((e.target as HTMLSelectElement).value)} aria-label="Database that receives the tag">
            {p.databases.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      </div>
      {locked && (
        <p class="te-locked">
          Defined in {p.base.db}. <button class="link" onClick={() => p.setTarget(p.base.db!)}>Edit it in {p.base.db}</button>
        </p>
      )}

      <section class="edit-box">
        <h3 class="edit-box-h">Name</h3>
        <Field label="Name"><input id="te-label" value={d.label} disabled={locked} onInput={(e) => upd({ label: (e.target as HTMLInputElement).value })} /></Field>
        <Field label="Key" info="How it is stored in the files. Lowercase letters, digits and hyphens.">
          <input id="te-key" value={p.mode === 'new' ? d.key || slug(d.label) : d.key} disabled={p.mode !== 'new'} onInput={(e) => upd({ key: slug((e.target as HTMLInputElement).value) })} />
        </Field>
        <Field label="Meaning" info="Shown when you hover the tag.">
          <input id="te-description" value={d.description ?? ''} disabled={locked} placeholder="What it means" onInput={(e) => upd({ description: (e.target as HTMLInputElement).value || undefined })} />
        </Field>
        <Field label="Icon"><input class="te-icon" value={d.icon ?? ''} disabled={locked} placeholder="◆" onInput={(e) => upd({ icon: (e.target as HTMLInputElement).value || undefined })} /></Field>
      </section>

      <section class="edit-box">
        <h3 class="edit-box-h">Applies to</h3>
        <div class="seg" role="group" aria-label="Applies to">
          {(['position', 'move', 'both'] as Domain[]).map((x) => (
            <button key={x} class={domain === x ? 'on' : ''} aria-pressed={domain === x} disabled={locked} onClick={() => upd({ for: x === 'both' ? undefined : x })}>{DOMAIN_NAMES[x]}</button>
          ))}
        </div>
      </section>

      <section class="edit-box">
        <h3 class="edit-box-h">Settings<Info text="A tag can use the settings of another one (type, options, range, sides). They stay linked: changing them there changes both. Copy and disconnect makes them this tag's own." /></h3>
        {source ? (
          <div class="link-card">
            <span>Same settings as <button class="link" onClick={() => p.onOpen(source.key)}>{source.label}</button>. Changes there apply here too.</span>
            {!locked && (
              <span class="grp">
                <button id="te-unlink" onClick={() => upd({ like: undefined, options: d.options?.map(({ db: _db, ...o }) => (void _db, o)) })} title="Keep a copy of the settings, no longer linked">Copy and disconnect</button>
              </span>
            )}
          </div>
        ) : (
          <label class="te-link">
            <span>Same settings as</span>
            <select id="te-like" value="" disabled={locked} onChange={(e) => link((e.target as HTMLSelectElement).value)}>
              <option value="">— its own —</option>
              {linkable.map((x) => <option key={x.key} value={x.key}>{x.label} ({typeName(x.type)})</option>)}
            </select>
          </label>
        )}
        {usedBy.length > 0 && <p class="hint used-by">Also used by: {usedBy.map((x, i) => <span key={x.key}>{i > 0 && ', '}<button class="link" onClick={() => p.onOpen(x.key)}>{x.label}</button></span>)}</p>}
      </section>

      <section class="edit-box">
        <h3 class="edit-box-h">Type</h3>
        <div class="type-grid" role="radiogroup" aria-label="Type">
          {TYPES.map((t) => (
            <button key={t.type} role="radio" aria-checked={d.type === t.type} class={`type-card ${d.type === t.type ? 'picked' : ''}`} disabled={fixed} title={t.about} onClick={() => upd({ type: t.type, options: t.type === 'choice' || t.type === 'multi' ? d.options ?? [] : d.options })}>
              <span class="tag-icon" aria-hidden>{t.icon}</span>
              <b>{t.name}</b>
              <small>{t.about}</small>
            </button>
          ))}
        </div>
      </section>

      {d.type === 'number' && (
        <section class="edit-box">
          <h3 class="edit-box-h">Range</h3>
          <div class="te-grid">
            <Field label="From"><input id="te-min" type="number" step="any" value={d.min ?? ''} disabled={fixed} onInput={(e) => upd({ min: num((e.target as HTMLInputElement).value) })} /></Field>
            <Field label="To"><input id="te-max" type="number" step="any" value={d.max ?? ''} disabled={fixed} onInput={(e) => upd({ max: num((e.target as HTMLInputElement).value) })} /></Field>
            <Field label="Step"><input id="te-step" type="number" step="any" min="0" value={d.step ?? ''} disabled={fixed} onInput={(e) => upd({ step: num((e.target as HTMLInputElement).value) })} /></Field>
            <Field label="Unit"><input id="te-unit" value={d.unit ?? ''} disabled={fixed} placeholder="points" onInput={(e) => upd({ unit: (e.target as HTMLInputElement).value || undefined })} /></Field>
          </div>
        </section>
      )}

      {d.type === 'slider' && (
        <section class="edit-box">
          <h3 class="edit-box-h">Sides</h3>
          <div class="te-grid">
            <Field label="Left"><input value={d.ends?.[0] ?? ''} disabled={fixed} placeholder="White better" onInput={(e) => upd({ ends: [(e.target as HTMLInputElement).value, d.ends?.[1] ?? ''] })} /></Field>
            <Field label="Right"><input value={d.ends?.[1] ?? ''} disabled={fixed} placeholder="Black better" onInput={(e) => upd({ ends: [d.ends?.[0] ?? '', (e.target as HTMLInputElement).value] })} /></Field>
          </div>
          <label class="te-check"><input type="checkbox" checked={!!d.negate} disabled={fixed} onChange={(e) => upd({ negate: (e.target as HTMLInputElement).checked || undefined })} /> Swap colors turns it around</label>
        </section>
      )}

      {hasOptions && (
        <section class="edit-box">
          <h3 class="edit-box-h">Options<Info text="Each option has a name, an icon or a color, and a meaning shown on hover. The arrows set their order." /></h3>
          {d.type === 'choice' && (
            <div class="seg" role="group" aria-label="Shown as">
              {(['dropdown', 'buttons'] as const).map((c) => (
                <button key={c} class={(d.control ?? 'dropdown') === c ? 'on' : ''} disabled={fixed} onClick={() => upd({ control: c === 'dropdown' ? undefined : c })}>{c === 'dropdown' ? 'A list' : 'Buttons'}</button>
              ))}
            </div>
          )}
          <ol class="opt-cards">
            {opts.map((o, i) => (
              <li key={i} class={`opt-card ${mine(o) ? '' : 'inherited'}`}>
                <div class="opt-line">
                  <span class="o-mark" title="How it is shown">{o.color || o.icon ? <OptionMark o={o} /> : <span class="hint">–</span>}</span>
                  <input class="o-icon" value={o.icon ?? ''} placeholder="◆" aria-label="Icon" disabled={!mine(o)} onInput={(e) => updOpt(i, { icon: (e.target as HTMLInputElement).value || undefined })} />
                  <input class="o-label" value={o.label} placeholder="Option" aria-label="Option name" disabled={!mine(o)} onInput={(e) => {
                    const label = (e.target as HTMLInputElement).value
                    updOpt(i, { label, value: !o.value || o.value === slug(o.label) ? slug(label) : o.value })
                  }} />
                  <input class="o-color" type="color" value={o.color ?? '#888888'} aria-label="Color" disabled={!mine(o)} onInput={(e) => updOpt(i, { color: (e.target as HTMLInputElement).value })} />
                  {o.color && mine(o) && <button class="icon ghost" aria-label="No color" title="No color" onClick={() => updOpt(i, { color: undefined })}>⊘</button>}
                  {!mine(o) && <span class="src-badge" title={`Defined in ${o.db}`}>{o.db}</span>}
                  <span class="spacer" />
                  {!fixed && <button class="icon ghost" aria-label={`Move ${o.label} up`} disabled={i === 0} onClick={() => moveOpt(i, -1)}>↑</button>}
                  {!fixed && <button class="icon ghost" aria-label={`Move ${o.label} down`} disabled={i === opts.length - 1} onClick={() => moveOpt(i, 1)}>↓</button>}
                  {mine(o) && <button class="icon ghost" aria-label={`Remove ${o.label || 'option'}`} onClick={() => upd({ options: opts.filter((_, j) => j !== i) })}>×</button>}
                </div>
                <input class="o-desc" value={o.description ?? ''} placeholder="What it means" aria-label="Meaning" disabled={!mine(o)} onInput={(e) => updOpt(i, { description: (e.target as HTMLInputElement).value || undefined })} />
                {d.key === 'kind' && (
                  <label class="te-check"><input type="checkbox" checked={!!o.good} disabled={!mine(o)} onChange={(e) => updOpt(i, { good: (e.target as HTMLInputElement).checked || undefined })} /> A right answer (quiz, main lines)</label>
                )}
              </li>
            ))}
          </ol>
          {!d.like && <button class="add-option" onClick={() => upd({ options: [...opts, { value: '', label: '' }] })}><Plus size={14} /> Add an option</button>}
        </section>
      )}

      {!locked && (
        <section class="edit-box">
          <h3 class="edit-box-h">Behavior</h3>
          {domain !== 'move' && (
            <>
              <label class="te-check"><input type="checkbox" checked={d.panel === 'sequence'} onChange={(e) => upd({ panel: (e.target as HTMLInputElement).checked ? 'sequence' : undefined })} /> About the whole sequence (read from its first position)</label>
              <label class="te-check"><input type="checkbox" checked={!!d.inherit} onChange={(e) => upd({ inherit: (e.target as HTMLInputElement).checked || undefined })} /> Later positions keep it until they set their own</label>
            </>
          )}
          <label class="te-check"><input type="checkbox" checked={!!d.suggest} onChange={(e) => upd({ suggest: (e.target as HTMLInputElement).checked || undefined })} /> Always offered in the editor</label>
        </section>
      )}

      {error && <p class="error" role="alert">{error}</p>}
      <div class="te-actions">
        {p.mode === 'own' && d.key !== 'kind' && <button class="danger-text" onClick={remove}>Remove from {p.target}</button>}
        <span class="spacer" />
        <button class="on" id="te-save" onClick={save}>{p.mode === 'new' ? `Create in ${p.target}` : locked ? `Save the options of ${p.target}` : `Save in ${p.target}`}</button>
      </div>
    </div>
  )
}

const num = (s: string): number | undefined => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s))
