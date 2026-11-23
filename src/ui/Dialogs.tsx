/** Dialogs for editing: export changes, new entry, new database (SPEC §10, §10.1). */
import { useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { validateAll } from '../core/validate'
import type { TagDef as FieldDef, TagOption as FieldOption, TagType as FieldType, TagRegistry } from '../core/tags'
import { changes, download, makePatch, makeZip, type Workspace } from '../edit/workspace'
import { parsePt, type Pt, type Sign } from '../core/geometry'
import { FREE_LABELS, type Free } from '../core/model'
import type { NewEntry } from '../edit/ops'
import type { DatabaseInfo } from '../data/load'
import { BRANCH, REPO } from '../config'

function Shell({ title, close, children }: { title: string; close: () => void; children: ComponentChildren }) {
  return (
    <div class="modal" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="box" role="dialog" aria-label={title}>
        <div class="box-head">
          <h2>{title}</h2>
          <button class="ghost" onClick={close} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ExportDialog({ ws, close, onDiscard }: { ws: Workspace; close: () => void; onDiscard: () => void }) {
  const dbs = useMemo(() => [...new Set(ws.files.filter((f) => ws.dirty.has(f.path)).map((f) => f.db))], [ws.version])
  const [chosen, setChosen] = useState<Set<string>>(new Set(dbs))
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [copied, setCopied] = useState(false)
  const list = changes(ws, chosen)
  const patch = makePatch(list)
  const issues = validateAll(
    ws.files.filter((f) => chosen.has(f.db)),
    new Set(ws.databases.map((d) => d.id)),
  ).filter((i) => ws.dirty.has(i.file))
  const errors = issues.filter((i) => i.severity === 'error')
  const stamp = new Date().toISOString().slice(0, 10)

  return (
    <Shell title="Export changes" close={close}>
      {list.length === 0 ? (
        <p class="text">No changes to export yet.</p>
      ) : (
        <>
          <h3>Databases to include</h3>
          {dbs.map((d) => (
            <label key={d} class="cat-row">
              <input type="checkbox" checked={chosen.has(d)} onChange={() => {
                const n = new Set(chosen)
                n.has(d) ? n.delete(d) : n.add(d)
                setChosen(n)
              }} />
              {d}
            </label>
          ))}
          <p class="hint">One database per pull request is easiest to review.</p>
          <h3>Files ({list.length})</h3>
          <ul class="file-list">
            {list.map((c) => <li key={c.path}><code>{c.path}</code> {c.before === null ? <span class="badge">new</span> : null}</li>)}
          </ul>
          <h3>Checks</h3>
          {issues.length === 0 ? (
            <p class="ok">All checks pass.</p>
          ) : (
            <ul class="issues">
              {issues.map((i, k) => <li key={k} class={i.severity}><b>{i.severity === 'error' ? 'Error' : 'Warning'}</b> {i.file}: {i.message}</li>)}
            </ul>
          )}
          <details>
            <summary>Show the patch</summary>
            <pre class="patch">{patch}</pre>
          </details>
          <div class="actions wrap">
            <button class="on" disabled={errors.length > 0} onClick={() => download(`baduk-notebook-${stamp}.patch`, patch)}>Download .patch</button>
            <button disabled={errors.length > 0} onClick={async () => download(`baduk-notebook-${stamp}.zip`, await makeZip(list))}>Download changed files (.zip)</button>
            <button onClick={() => navigator.clipboard?.writeText(patch).then(() => setCopied(true), () => setCopied(false))}>{copied ? 'Copied' : 'Copy patch'}</button>
          </div>
          {errors.length > 0 && <p class="hint">Fix the errors above before exporting.</p>}
          <h3>Propose on GitHub (no git needed)</h3>
          <p class="hint">Opens GitHub with each file ready. Press "Commit changes…", choose "Create a new branch and start a pull request", and GitHub opens the pull request.</p>
          <ul class="propose">
            {list.map((c) => {
              const isNew = c.before === null
              const url = isNew
                ? `https://github.com/${REPO}/new/${BRANCH}?filename=${encodeURIComponent(c.path)}&value=${encodeURIComponent(c.after)}`
                : `https://github.com/${REPO}/edit/${BRANCH}/${c.path}`
              const tooLong = isNew && url.length > 7500
              return (
                <li key={c.path}>
                  <code>{c.path}</code>
                  {isNew && !tooLong ? (
                    <a class="btn-link" href={url} target="_blank" rel="noopener">Create on GitHub</a>
                  ) : (
                    <>
                      <button onClick={() => navigator.clipboard?.writeText(c.after)}>Copy content</button>
                      <a class="btn-link" href={isNew ? `https://github.com/${REPO}/new/${BRANCH}?filename=${encodeURIComponent(c.path)}` : url} target="_blank" rel="noopener">
                        {isNew ? 'Create on GitHub' : 'Edit on GitHub'}
                      </a>
                      <span class="hint">{isNew ? 'Too long for a link: copy, then paste on GitHub.' : 'Copy, then replace the text on GitHub.'}</span>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          <h3>Or with git</h3>
          <ol class="steps">
            <li>In a clone of the repository, run <code>git apply baduk-notebook-{stamp}.patch</code>.</li>
            <li>Or unzip the files into the repository folder, or upload them on GitHub ("Add file → Upload files").</li>
            <li>Open a pull request. The checks run automatically; once merged, the site shows your changes.</li>
          </ol>
        </>
      )}
      <h3>Drafts</h3>
      {confirmDiscard ? (
        <div class="actions">
          <span class="hint">Discard every unsaved change in this browser?</span>
          <button onClick={() => setConfirmDiscard(false)}>Keep them</button>
          <button class="danger" onClick={() => { onDiscard(); close() }}>Discard</button>
        </div>
      ) : (
        <button class="danger" disabled={list.length === 0 && !ws.dirty.size} onClick={() => setConfirmDiscard(true)}>Discard all changes…</button>
      )}
    </Shell>
  )
}


const PRESETS: Record<string, { label: string; B: string[] }> = {
  empty: { label: 'Empty corner', B: [] },
  '44': { label: 'Lone 4-4 stone', B: ['Q16'] },
  '34': { label: 'Lone 3-4 stone', B: ['R16'] },
  '33': { label: 'Lone 3-3 stone', B: ['R17'] },
  '54': { label: 'Lone 5-4 stone', B: ['P16'] },
  '53': { label: 'Lone 5-3 stone', B: ['P17'] },
}

export function NewEntryDialog({ type: initial, target, close, create }: { type: 'joseki' | 'shape'; target: string; close: () => void; create: (e: NewEntry) => string | null }) {
  const [type, setType] = useState(initial)
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [free, setFree] = useState<Free>(type === 'joseki' ? 'corner' : 'side')
  const [diff, setDiff] = useState(type === 'shape' ? '25k' : '15k')
  const [preset, setPreset] = useState(type === 'joseki' ? '44' : 'empty')
  const [toMove, setToMove] = useState<Sign>(type === 'joseki' ? -1 : 1)
  const [error, setError] = useState<string | null>(null)
  const finalId = id || (type === 'joseki' ? `joseki/${name.trim()}` : `life & death/${name.trim()}`)
  const submit = (e: Event) => {
    e.preventDefault()
    if (!name.trim()) return setError('Give the entry a name.')
    if (finalId.includes(':')) return setError('The id is a sequence such as joseki/4-4 point/my line, without ":".')
    const stones = { B: PRESETS[preset].B.map(parsePt).filter((p): p is Pt => !!p), W: [] as Pt[] }
    const err = create({ id: finalId, name: name.trim(), difficulty: diff, stones, toMove: toMove || 1, free })
    if (err) setError(err)
    else close()
  }
  return (
    <Shell title={type === 'joseki' ? 'New joseki' : 'New shape'} close={close}>
      <form onSubmit={submit} class="form">
        <div class="seg" role="group" aria-label="Kind">
          <button type="button" class={type === 'joseki' ? 'on' : ''} onClick={() => { setType('joseki'); setFree('corner'); setPreset('44'); setToMove(-1) }}>Joseki</button>
          <button type="button" class={type === 'shape' ? 'on' : ''} onClick={() => { setType('shape'); setFree('side'); setPreset('empty'); setToMove(1) }}>Life &amp; death</button>
        </div>
        <label class="f"><span class="fl">Name</span><input id="new-name" type="text" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder={type === 'joseki' ? '3-4 point · small knight approach' : 'Bent four · corner'} /></label>
        <label class="f"><span class="fl">Sequence id</span><input id="new-id" type="text" value={finalId} onInput={(e) => setId((e.target as HTMLInputElement).value)} /></label>
        <label class="f">
          <span class="fl">Placement</span>
          <select id="new-free" value={free} onChange={(e) => setFree((e.target as HTMLSelectElement).value as Free)}>
            {FREE_LABELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label class="f"><span class="fl">Difficulty</span><input id="new-diff" type="text" value={diff} onInput={(e) => setDiff((e.target as HTMLInputElement).value)} /></label>
        <label class="f">
          <span class="fl">Start from</span>
          <select id="new-start" value={preset} onChange={(e) => setPreset((e.target as HTMLSelectElement).value)}>
            {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label class="f">
          <span class="fl">To play</span>
          <select id="new-tomove" value={String(toMove)} onChange={(e) => setToMove(Number((e.target as HTMLSelectElement).value) as Sign)}>
            <option value="1">Black</option>
            <option value="-1">White</option>
          </select>
        </label>
        <p class="hint">Saved in <b>{target}</b> as a new file of <code>{target}/</code>. Add or remove set-up stones afterwards with the stone tools under the board.</p>
        {error && <p class="error">{error}</p>}
        <div class="actions"><button type="button" onClick={close}>Cancel</button><button class="on" type="submit">Create</button></div>
      </form>
    </Shell>
  )
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const COLORS = ['#3c7fbb', '#9d4fc7', '#1e9e4a', '#e8741c', '#d33232', '#138f8c', '#6d4c41', '#3949ab']

export function NewDatabaseDialog({ close, create, count }: { close: () => void; create: (d: DatabaseInfo) => string | null; count: number }) {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [desc, setDesc] = useState('')
  const [color, setColor] = useState(COLORS[count % COLORS.length])
  const [error, setError] = useState<string | null>(null)
  const finalId = id || slug(name)
  const submit = (e: Event) => {
    e.preventDefault()
    if (!name.trim()) return setError('Give the database a name.')
    const err = create({ id: finalId, name: name.trim(), description: desc.trim(), color, activeByDefault: true })
    if (err) setError(err)
    else close()
  }
  return (
    <Shell title="New database" close={close}>
      <form onSubmit={submit} class="form">
        <label class="f"><span class="fl">Name</span><input id="db-name" type="text" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="My 3-4 point joseki" /></label>
        <label class="f"><span class="fl">Id (folder)</span><input id="db-id" type="text" value={finalId} onInput={(e) => setId((e.target as HTMLInputElement).value)} /></label>
        <label class="f"><span class="fl">Description</span><input id="db-desc" type="text" value={desc} onInput={(e) => setDesc((e.target as HTMLInputElement).value)} /></label>
        <label class="f"><span class="fl">Color</span><input id="db-color" type="color" value={color} onInput={(e) => setColor((e.target as HTMLInputElement).value)} /></label>
        <p class="hint">The new database becomes the target for your edits. Exporting it adds its folder and its line in <code>db/index.json</code>.</p>
        {error && <p class="error">{error}</p>}
        <div class="actions"><button type="button" onClick={close}>Cancel</button><button class="on" type="submit">Create</button></div>
      </form>
    </Shell>
  )
}

export interface SessionLineView {
  id: number
  moves: { name: string; known: boolean }[]
  newMoves: number
  current: boolean
}

/** Pick which of the lines played in this session to store (SPEC §8.3). */
export function SaveLinesDialog(props: {
  lines: SessionLineView[]
  databases: DatabaseInfo[]
  target: string
  close: () => void
  save: (ids: number[], target: string) => void
  erase: (id: number) => void
}) {
  const [chosen, setChosen] = useState<Set<number>>(new Set(props.lines.filter((l) => l.current).map((l) => l.id)))
  const [target, setTarget] = useState(props.target)
  const toggle = (id: number) => {
    const n = new Set(chosen)
    n.has(id) ? n.delete(id) : n.add(id)
    setChosen(n)
  }
  return (
    <Shell title="Save lines" close={props.close}>
      {props.lines.length === 0 ? (
        <p class="text">Every line you played is already in your databases.</p>
      ) : (
        <>
          <p class="hint">Lines you played from this start that are not in your databases yet. The part already stored is in grey.</p>
          <ul class="line-list">
            {props.lines.map((l) => (
              <li key={l.id}>
                <label class="cat-row">
                  <input type="checkbox" checked={chosen.has(l.id)} onChange={() => toggle(l.id)} />
                  <span class="line-moves">
                    {l.moves.map((m, i) => <span key={i} class={m.known ? 'known' : 'new'}>{m.name}</span>)}
                  </span>
                  <span class="badge">{l.newMoves} new</span>
                  {l.current && <span class="badge">current</span>}
                </label>
                <button class="ghost danger-text" onClick={() => props.erase(l.id)} aria-label="Erase this line">Erase</button>
              </li>
            ))}
          </ul>
          <label class="f">
            <span class="fl">Save into</span>
            <select value={target} onChange={(e) => setTarget((e.target as HTMLSelectElement).value)} aria-label="Database to save into">
              {props.databases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <div class="actions">
            <button onClick={() => setChosen(new Set(props.lines.map((l) => l.id)))}>Select all</button>
            <button class="on" disabled={!chosen.size} onClick={() => props.save([...chosen], target)}>Save {chosen.size} line{chosen.size === 1 ? '' : 's'}</button>
          </div>
        </>
      )}
    </Shell>
  )
}

const TYPES: [FieldType, string][] = [
  ['choice', 'Choice (dropdown or buttons)'], ['multi', 'Several choices'], ['slider', 'Slider (a bar between two ends)'],
  ['number', 'Number'], ['flag', 'Yes / no'], ['color', 'Color (Black / White)'], ['rank', 'Rank (15k, 2d…)'], ['text', 'Text'],
  ['list', 'List of texts'], ['board', 'Shapes on the board'],
]

/**
 * Edits the tag descriptions (db/tags.json): how the interface shows and edits a key — label, type,
 * options, icons, colors and swap behavior. Keys that are not described still work, shown as key: value.
 */
export function TagsDialog({ registry, save, close }: { registry: TagRegistry; save: (r: TagRegistry) => void; close: () => void }) {
  const [fields, setFields] = useState<FieldDef[]>(() => JSON.parse(JSON.stringify(registry.tags)))
  const [sel, setSel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const f = fields[sel]
  const upd = (patch: Partial<FieldDef>) => setFields(fields.map((x, i) => (i === sel ? { ...x, ...patch } : x)))
  const opts = f?.options ?? []
  const updOpt = (k: number, patch: Partial<FieldOption>) => upd({ options: opts.map((o, i) => (i === k ? { ...o, ...patch } : o)) })
  const move = <T,>(list: T[], i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= list.length) return list
    const out = [...list]
    ;[out[i], out[j]] = [out[j], out[i]]
    return out
  }
  const submit = () => {
    const keys = fields.map((x) => x.key)
    const bad = fields.find((x) => !/^[a-z0-9][a-z0-9-]*$/.test(x.key))
    if (bad) return setError(`"${bad.key || '(empty)'}": keys use lowercase letters, digits and hyphens.`)
    if (new Set(keys).size !== keys.length) return setError('Two keys have the same name.')
    if (!keys.includes('kind')) return setError('The "kind" key (main move, mistake…) is needed by the app.')
    save({ tags: fields })
    close()
  }
  return (
    <Shell title="Known tags" close={close}>
      <p class="hint">Positions and moves can carry any tag. The keys described here are shown and edited their own way; any other key appears as key: value. Changes are saved in this browser; <b>Export / pull request</b> proposes them as <code>db/tags.json</code>.</p>
      <div class="schema-edit">
        <div class="schema-list" role="listbox" aria-label="Keys">
          {fields.map((x, i) => (
            <button key={i} role="option" aria-selected={i === sel} class={i === sel ? 'on' : ''} onClick={() => setSel(i)}>
              <span>{x.icon ?? ''} {x.label || x.key}</span>
              <small>{x.for ?? 'any'}{x.panel === 'sequence' ? ' · joseki' : ''} · {x.type}</small>
            </button>
          ))}
          <button class="add" onClick={() => { setFields([...fields, { key: `key-${fields.length + 1}`, label: 'New key', type: 'choice', options: [] }]); setSel(fields.length) }}>+ New key</button>
        </div>
        {f && (
          <div class="schema-field">
            <div class="grp">
              <button onClick={() => { setFields(move(fields, sel, -1)); setSel(Math.max(0, sel - 1)) }} disabled={sel === 0}>↑</button>
              <button onClick={() => { setFields(move(fields, sel, 1)); setSel(Math.min(fields.length - 1, sel + 1)) }} disabled={sel === fields.length - 1}>↓</button>
              <span class="spacer" />
              <button class="danger-text" disabled={f.key === 'kind'} onClick={() => { setFields(fields.filter((_, i) => i !== sel)); setSel(Math.max(0, sel - 1)) }}>Remove key</button>
            </div>
            <label class="f"><span class="fl">Label</span><input id="schema-label" value={f.label} onInput={(e) => upd({ label: (e.target as HTMLInputElement).value })} /></label>
            <label class="f"><span class="fl">Key</span><input id="schema-key" value={f.key} onInput={(e) => upd({ key: (e.target as HTMLInputElement).value.trim() })} disabled={f.key === 'kind'} /></label>
            <label class="f"><span class="fl">Offered on</span>
              <select value={f.for ?? ''} onChange={(e) => upd({ for: ((e.target as HTMLSelectElement).value || undefined) as FieldDef['for'] })}>
                <option value="">Positions and moves</option><option value="move">Moves</option><option value="position">Positions</option>
              </select>
            </label>
            <label class="f"><span class="fl">Shown in</span>
              <select value={f.panel ?? ''} onChange={(e) => upd({ panel: ((e.target as HTMLSelectElement).value || undefined) as FieldDef['panel'] })}>
                <option value="">The position or move panel</option><option value="sequence">This joseki (from the start of the sequence)</option>
              </select>
            </label>
            <label class="f"><span class="fl">Suggested</span><span><input type="checkbox" checked={!!f.suggest} onChange={(e) => upd({ suggest: (e.target as HTMLInputElement).checked || undefined })} /> always offered in the editor, even without a value</span></label>
            <label class="f"><span class="fl">Type</span>
              <select id="schema-type" value={f.type} onChange={(e) => upd({ type: (e.target as HTMLSelectElement).value as FieldType })}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label class="f"><span class="fl">Icon</span><input value={f.icon ?? ''} placeholder="a symbol or emoji" onInput={(e) => upd({ icon: (e.target as HTMLInputElement).value || undefined })} /></label>
            <label class="f"><span class="fl">Hint</span><input value={f.hint ?? ''} onInput={(e) => upd({ hint: (e.target as HTMLInputElement).value || undefined })} /></label>
            {f.for !== 'move' && <label class="f"><span class="fl">Inherited</span><span><input type="checkbox" checked={!!f.inherit} onChange={(e) => upd({ inherit: (e.target as HTMLInputElement).checked || undefined })} /> later positions show it until they set their own</span></label>}
            {f.type === 'choice' && (
              <label class="f"><span class="fl">Shown as</span>
                <select value={f.control ?? 'dropdown'} onChange={(e) => upd({ control: (e.target as HTMLSelectElement).value as 'buttons' | 'dropdown' })}><option value="dropdown">Dropdown</option><option value="buttons">Buttons</option></select>
              </label>
            )}
            {f.type === 'slider' && (
              <>
                <label class="f"><span class="fl">Left end</span><input value={f.ends?.[0] ?? ''} onInput={(e) => upd({ ends: [(e.target as HTMLInputElement).value, f.ends?.[1] ?? ''] })} /></label>
                <label class="f"><span class="fl">Right end</span><input value={f.ends?.[1] ?? ''} onInput={(e) => upd({ ends: [f.ends?.[0] ?? '', (e.target as HTMLInputElement).value] })} /></label>
                <label class="f"><span class="fl">Swap colors</span><span><input type="checkbox" checked={!!f.negate} onChange={(e) => upd({ negate: (e.target as HTMLInputElement).checked || undefined })} /> turns the bar around</span></label>
              </>
            )}
            <label class="f"><span class="fl">Swaps with key</span>
              <select value={f.swapKey ?? ''} onChange={(e) => upd({ swapKey: (e.target as HTMLSelectElement).value || undefined })}>
                <option value="">— (none)</option>
                {fields.filter((x) => x.key !== f.key).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </label>
            {(f.type === 'choice' || f.type === 'multi') && (
              <div class="schema-opts">
                <div class="fam">Options</div>
                {opts.map((o, k) => (
                  <div class="opt-row" key={k}>
                    <input class="o-icon" value={o.icon ?? ''} placeholder="icon" aria-label="Icon" onInput={(e) => updOpt(k, { icon: (e.target as HTMLInputElement).value || undefined })} />
                    <input class="o-label" value={o.label} placeholder="label" aria-label="Label" onInput={(e) => updOpt(k, { label: (e.target as HTMLInputElement).value })} />
                    <input class="o-value" value={o.value} placeholder="value" aria-label="Stored value" onInput={(e) => updOpt(k, { value: (e.target as HTMLInputElement).value.trim() })} />
                    <input class="o-color" type="color" value={o.color ?? '#888888'} aria-label="Color" onInput={(e) => updOpt(k, { color: (e.target as HTMLInputElement).value })} />
                    <select aria-label="With Swap colors it becomes" value={o.swap ?? ''} onChange={(e) => updOpt(k, { swap: (e.target as HTMLSelectElement).value || undefined })}>
                      <option value="">no swap</option>
                      {opts.filter((x) => x.value !== o.value).map((x) => <option key={x.value} value={x.value}>⇄ {x.label}</option>)}
                    </select>
                    {f.key === 'kind' && <label title="Counts as a good move"><input type="checkbox" checked={!!o.good} onChange={(e) => updOpt(k, { good: (e.target as HTMLInputElement).checked || undefined })} />good</label>}
                    <button class="icon ghost" aria-label="Move up" onClick={() => upd({ options: move(opts, k, -1) })}>↑</button>
                    <button class="icon ghost" aria-label="Remove option" onClick={() => upd({ options: opts.filter((_, i) => i !== k) })}>×</button>
                  </div>
                ))}
                <button onClick={() => upd({ options: [...opts, { value: `option-${opts.length + 1}`, label: 'New option' }] })}>+ Add option</button>
              </div>
            )}
          </div>
        )}
      </div>
      {error && <p class="error">{error}</p>}
      <div class="actions"><button onClick={close}>Cancel</button><button class="on" onClick={submit}>Save tags</button></div>
    </Shell>
  )
}
