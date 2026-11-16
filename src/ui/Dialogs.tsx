/** Dialogs for editing: export changes, new entry, new database (SPEC §10, §10.1). */
import { useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { validateAll } from '../core/validate'
import { changes, download, makePatch, makeZip, type Workspace } from '../edit/workspace'
import { parsePt, type Pt, type Sign } from '../core/geometry'
import type { NewEntry } from '../edit/ops'
import type { DatabaseInfo } from '../data/load'

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
          <h3>How to submit</h3>
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

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const PRESETS: Record<string, { label: string; B: string[] }> = {
  empty: { label: 'Empty corner', B: [] },
  '44': { label: 'Lone 4-4 stone', B: ['Q16'] },
  '34': { label: 'Lone 3-4 stone', B: ['R16'] },
  '33': { label: 'Lone 3-3 stone', B: ['R17'] },
  '54': { label: 'Lone 5-4 stone', B: ['P16'] },
  '53': { label: 'Lone 5-3 stone', B: ['P17'] },
}

export function NewEntryDialog({ type, target, close, create }: { type: 'joseki' | 'shape'; target: string; close: () => void; create: (e: NewEntry) => string | null }) {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [diff, setDiff] = useState(type === 'shape' ? '25k' : '15k')
  const [preset, setPreset] = useState(type === 'joseki' ? '44' : 'empty')
  const [toMove, setToMove] = useState<Sign>(type === 'joseki' ? -1 : 0)
  const [error, setError] = useState<string | null>(null)
  const finalId = id || slug(name)
  const submit = (e: Event) => {
    e.preventDefault()
    if (!name.trim()) return setError('Give the entry a name.')
    if (!/^[a-z0-9-]+$/.test(finalId)) return setError('The id may only use lowercase letters, digits and hyphens.')
    const stones = { B: PRESETS[preset].B.map(parsePt).filter((p): p is Pt => !!p), W: [] as Pt[] }
    const err = create({ type, id: finalId, name: name.trim(), difficulty: diff, stones, toMove })
    if (err) setError(err)
    else close()
  }
  return (
    <Shell title={type === 'joseki' ? 'New joseki' : 'New shape'} close={close}>
      <form onSubmit={submit} class="form">
        <label class="f"><span class="fl">Name</span><input id="new-name" type="text" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder={type === 'joseki' ? '3-4 point · small knight approach' : 'Bent four · corner'} /></label>
        <label class="f"><span class="fl">Id</span><input id="new-id" type="text" value={finalId} onInput={(e) => setId((e.target as HTMLInputElement).value)} /></label>
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
            <option value="0">Either (shapes)</option>
          </select>
        </label>
        <p class="hint">Saved in <b>{target}</b> as <code>{target}/{type === 'shape' ? 'shapes' : 'joseki'}/{finalId || 'id'}.sgf</code>. Add or remove set-up stones afterwards with the stone tools under the board.</p>
        {error && <p class="error">{error}</p>}
        <div class="actions"><button type="button" onClick={close}>Cancel</button><button class="on" type="submit">Create</button></div>
      </form>
    </Shell>
  )
}

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
