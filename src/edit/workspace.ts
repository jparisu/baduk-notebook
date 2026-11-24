/**
 * Editing workspace (SPEC §10): the working copy of every database file, which files changed,
 * drafts saved in IndexedDB, and export as a patch or zip.
 */
import { get, set, del } from 'idb-keyval'
import { structuredPatch } from 'diff'
import type { DatabaseInfo } from '../data/load'
import { parseDbFile, writeDbFile, type DbFile } from '../core/model'
import { mergeRegistries, parseRegistry, setRegistry, writeRegistry, type TagDef, type TagRegistry } from '../core/tags'
import { storageKey } from '../storage'

export interface WorkFile extends DbFile {
  /** Text as loaded from the site, or null for a file created in the app. */
  original: string | null
}

export interface Workspace {
  files: WorkFile[]
  databases: DatabaseInfo[]
  originalIndex: string
  dirty: Set<string>
  indexDirty: boolean
  /** Each database's tags (db/<database>/tags.json), as stored; the app uses them merged (mergedTags). */
  tags: Record<string, TagRegistry>
  originalTags: Record<string, string>
  /** Databases whose tags changed. */
  tagsDirty: Set<string>
  version: number
}

// v3: the 0.2 data model (positions and moves with comments and tags).
const DRAFT_KEY = storageKey('baduk-notebook.drafts.v3')

interface Draft {
  databases: DatabaseInfo[] | null
  /** Tags of the databases whose tags changed. */
  tags?: Record<string, TagRegistry> | null
  files: { db: string; path: string; text: string; isNew: boolean }[]
}

/** `tagTexts`: the text of each database's tags.json (databases without one have no entry). */
export function createWorkspace(databases: DatabaseInfo[], loaded: { db: string; path: string; text: string }[], tagTexts: Record<string, string> = {}): Workspace {
  return {
    tags: Object.fromEntries(Object.entries(tagTexts).map(([db, t]) => [db, parseRegistry(t)])),
    originalTags: { ...tagTexts },
    tagsDirty: new Set(),
    files: loaded.map((f) => ({ ...parseDbFile(f.db, f.path, f.text), original: f.text })),
    databases,
    originalIndex: indexText(databases),
    dirty: new Set(),
    indexDirty: false,
    version: 0,
  }
}

export const indexText = (databases: DatabaseInfo[]) => JSON.stringify({ databases }, null, 2) + '\n'

/** The tags the app uses: every database's, merged in the order of db/index.json (docs/MODEL.md §3.1). */
export const mergedTags = (ws: Workspace) => mergeRegistries(ws.databases.map((d) => ({ db: d.id, registry: ws.tags[d.id] ?? { tags: [] } })))

/** Replaces one database's tags (the Tags tab, or a key created in the editor). */
export function setDbTags(ws: Workspace, db: string, registry: TagRegistry) {
  ws.tags[db] = registry
  const before = ws.originalTags[db] ?? writeRegistry({ tags: [] })
  if (writeRegistry(registry) !== before) ws.tagsDirty.add(db)
  else ws.tagsDirty.delete(db)
  setRegistry(mergedTags(ws))
  ws.version++
}

/** Adds or replaces one tag in a database's own tags (its stored entry: a whole tag, or options it adds). */
export function putTagDef(ws: Workspace, db: string, def: TagDef) {
  const clean = stripRuntime(def)
  const list = ws.tags[db]?.tags ?? []
  setDbTags(ws, db, { tags: list.some((d) => d.key === def.key) ? list.map((d) => (d.key === def.key ? clean : d)) : [...list, clean] })
}

/** Removes a tag from a database's own tags. */
export function dropTagDef(ws: Workspace, db: string, key: string) {
  setDbTags(ws, db, { tags: (ws.tags[db]?.tags ?? []).filter((d) => d.key !== key) })
}

/** A tag as stored: without the database marks that merging adds. */
function stripRuntime(def: TagDef): TagDef {
  const { db: _db, ...rest } = def
  void _db
  const out: TagDef = { ...rest }
  if (def.options) out.options = def.options.map(({ db: _o, ...o }) => (void _o, o))
  for (const k of Object.keys(out) as (keyof TagDef)[]) if (out[k] === undefined) delete out[k]
  return out
}

/** Applies drafts saved in this browser. */
export async function restoreDrafts(ws: Workspace): Promise<number> {
  let draft: Draft | undefined
  try {
    draft = await get<Draft>(DRAFT_KEY)
  } catch {
    return 0
  }
  if (!draft) return 0
  if (draft.databases) {
    ws.databases = draft.databases
    ws.indexDirty = true
  }
  for (const [db, reg] of Object.entries(draft.tags ?? {})) {
    ws.tags[db] = reg
    ws.tagsDirty.add(db)
  }
  setRegistry(mergedTags(ws))
  let n = 0
  for (const f of draft.files) {
    let parsed
    try {
      parsed = parseDbFile(f.db, f.path, f.text)
    } catch {
      continue // a draft this version cannot read
    }
    const existing = ws.files.find((x) => x.path === f.path)
    if (existing) Object.assign(existing, { positions: parsed.positions, loose: parsed.loose })
    else ws.files.push({ ...parsed, original: null })
    ws.dirty.add(f.path)
    n++
  }
  ws.version++
  return n + (draft.databases ? 1 : 0) + Object.keys(draft.tags ?? {}).length
}

export async function saveDrafts(ws: Workspace) {
  const draft: Draft = {
    databases: ws.indexDirty ? ws.databases : null,
    tags: ws.tagsDirty.size ? Object.fromEntries([...ws.tagsDirty].map((db) => [db, ws.tags[db] ?? { tags: [] }])) : null,
    files: ws.files
      .filter((f) => ws.dirty.has(f.path))
      .map((f) => ({ db: f.db, path: f.path, text: writeDbFile(f), isNew: f.original === null })),
  }
  try {
    if (!draft.files.length && !draft.databases && !draft.tags) await del(DRAFT_KEY)
    else await set(DRAFT_KEY, draft)
  } catch {
    /* storage unavailable: drafts live only in this tab */
  }
}

export async function discardDrafts(ws: Workspace) {
  try {
    await del(DRAFT_KEY)
  } catch {
    /* ignore */
  }
  ws.files = ws.files.filter((f) => f.original !== null)
  for (const f of ws.files) if (ws.dirty.has(f.path)) Object.assign(f, parseDbFile(f.db, f.path, f.original!), { original: f.original })
  ws.dirty.clear()
  ws.databases = JSON.parse(ws.originalIndex).databases
  ws.indexDirty = false
  ws.tags = Object.fromEntries(Object.entries(ws.originalTags).map(([db, t]) => [db, parseRegistry(t)]))
  ws.tagsDirty.clear()
  setRegistry(mergedTags(ws))
  ws.version++
}

export function changeCount(ws: Workspace) {
  return ws.dirty.size + (ws.indexDirty ? 1 : 0) + ws.tagsDirty.size
}

/* ---- Export ---- */

export interface Change {
  path: string // repository path, e.g. "db/general/joseki/x.json"
  before: string | null
  after: string
}

export function changes(ws: Workspace, onlyDbs?: Set<string>): Change[] {
  const out: Change[] = []
  if (ws.indexDirty) out.push({ path: 'db/index.json', before: ws.originalIndex, after: indexText(ws.databases) })
  for (const db of ws.tagsDirty) if (!onlyDbs || onlyDbs.has(db)) out.push({ path: `db/${db}/tags.json`, before: ws.originalTags[db] ?? null, after: writeRegistry(ws.tags[db] ?? { tags: [] }) })
  for (const f of ws.files) {
    if (!ws.dirty.has(f.path) || (onlyDbs && !onlyDbs.has(f.db))) continue
    const after = writeDbFile(f)
    if (after !== f.original) out.push({ path: `db/${f.path}`, before: f.original, after })
  }
  return out
}

/** A patch that `git apply` accepts. */
export function makePatch(list: Change[]): string {
  return list
    .map((c) => {
      const isNew = c.before === null
      const p = structuredPatch(`a/${c.path}`, `b/${c.path}`, c.before ?? '', c.after, '', '', { context: 3 })
      const head = [`diff --git a/${c.path} b/${c.path}`]
      if (isNew) head.push('new file mode 100644', '--- /dev/null')
      else head.push(`--- a/${c.path}`)
      head.push(`+++ b/${c.path}`)
      const hunks = p.hunks.map((h) => {
        const oldStart = h.oldLines === 0 ? 0 : h.oldStart
        return [`@@ -${oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines].join('\n')
      })
      return [...head, ...hunks].join('\n') + '\n'
    })
    .join('')
}

export async function makeZip(list: Change[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const c of list) zip.file(c.path, c.after)
  return zip.generateAsync({ type: 'blob' })
}

export function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

