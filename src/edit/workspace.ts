/**
 * Editing workspace (SPEC §10): the working copy of every database file, which files changed,
 * drafts saved in IndexedDB, and export as a patch or zip.
 */
import { get, set, del } from 'idb-keyval'
import { structuredPatch } from 'diff'
import type { DatabaseInfo } from '../data/load'
import { parseDbFile, writeDbFile, type DbFile } from '../core/model'
import { getRegistry, parseRegistry, setRegistry, writeRegistry, type TagRegistry } from '../core/tags'
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
  /** The tag descriptions (db/tags.json), editable in the app. */
  registry: TagRegistry
  originalRegistry: string
  registryDirty: boolean
  version: number
}

// v3: the 0.2 data model (positions and moves with comments and tags).
const DRAFT_KEY = storageKey('baduk-notebook.drafts.v3')

interface Draft {
  databases: DatabaseInfo[] | null
  registry?: TagRegistry | null
  files: { db: string; path: string; text: string; isNew: boolean }[]
}

export function createWorkspace(databases: DatabaseInfo[], loaded: { db: string; path: string; text: string }[], tagsText = writeRegistry(getRegistry())): Workspace {
  return {
    registry: parseRegistry(tagsText),
    originalRegistry: tagsText,
    registryDirty: false,
    files: loaded.map((f) => ({ ...parseDbFile(f.db, f.path, f.text), original: f.text })),
    databases,
    originalIndex: indexText(databases),
    dirty: new Set(),
    indexDirty: false,
    version: 0,
  }
}

export const indexText = (databases: DatabaseInfo[]) => JSON.stringify({ databases }, null, 2) + '\n'

/** Applies drafts saved in this browser. */
export async function restoreDrafts(ws: Workspace): Promise<number> {
  let draft: Draft | undefined
  try {
    draft = await get<Draft>(DRAFT_KEY)
  } catch {
    return 0
  }
  if (!draft) return 0
  if (draft.registry) {
    ws.registry = draft.registry
    ws.registryDirty = true
    setRegistry(draft.registry)
  }
  if (draft.databases) {
    ws.databases = draft.databases
    ws.indexDirty = true
  }
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
  return n + (draft.databases ? 1 : 0) + (draft.registry ? 1 : 0)
}

export async function saveDrafts(ws: Workspace) {
  const draft: Draft = {
    databases: ws.indexDirty ? ws.databases : null,
    registry: ws.registryDirty ? ws.registry : null,
    files: ws.files
      .filter((f) => ws.dirty.has(f.path))
      .map((f) => ({ db: f.db, path: f.path, text: writeDbFile(f), isNew: f.original === null })),
  }
  try {
    if (!draft.files.length && !draft.databases && !draft.registry) await del(DRAFT_KEY)
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
  ws.registry = parseRegistry(ws.originalRegistry)
  ws.registryDirty = false
  setRegistry(ws.registry)
  ws.version++
}

export function changeCount(ws: Workspace) {
  return ws.dirty.size + (ws.indexDirty ? 1 : 0) + (ws.registryDirty ? 1 : 0)
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
  if (ws.registryDirty) out.push({ path: 'db/tags.json', before: ws.originalRegistry, after: writeRegistry(ws.registry) })
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

/** Replaces the tag descriptions (the Keys dialog, or a key created in the editor). */
export function updateRegistry(ws: Workspace, registry: TagRegistry) {
  ws.registry = registry
  ws.registryDirty = writeRegistry(registry) !== ws.originalRegistry
  setRegistry(registry)
  ws.version++
}
