/**
 * Editing workspace (SPEC §10): the working copy of every database file, which files changed,
 * drafts saved in IndexedDB, and export as a patch or zip.
 */
import { get, set, del } from 'idb-keyval'
import { structuredPatch } from 'diff'
import type { DatabaseInfo } from '../data/load'
import { parseDbFile, writeDbFile, type DbFile } from '../core/model'
import { getSchema, parseSchema, setSchema, writeSchema, type Schema } from '../core/schema'
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
  /** The value schema (db/schema.json), editable in the app. */
  schema: Schema
  originalSchema: string
  schemaDirty: boolean
  version: number
}

const DRAFT_KEY = storageKey('baduk-notebook.drafts.v2')

interface Draft {
  databases: DatabaseInfo[] | null
  schema?: Schema | null
  files: { db: string; path: string; text: string; isNew: boolean }[]
}

export function createWorkspace(databases: DatabaseInfo[], loaded: { db: string; path: string; text: string }[], schemaText = writeSchema(getSchema())): Workspace {
  return {
    schema: parseSchema(schemaText),
    originalSchema: schemaText,
    schemaDirty: false,
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
  if (draft.schema) {
    // Before the files: reading them follows the schema.
    ws.schema = draft.schema
    ws.schemaDirty = true
    setSchema(draft.schema)
  }
  if (draft.databases) {
    ws.databases = draft.databases
    ws.indexDirty = true
  }
  for (const f of draft.files) {
    const positions = parseDbFile(f.db, f.path, f.text).positions
    const existing = ws.files.find((x) => x.path === f.path)
    if (existing) existing.positions = positions
    else ws.files.push({ db: f.db, path: f.path, positions, original: null })
    ws.dirty.add(f.path)
  }
  ws.version++
  return draft.files.length + (draft.databases ? 1 : 0) + (draft.schema ? 1 : 0)
}

export async function saveDrafts(ws: Workspace) {
  const draft: Draft = {
    databases: ws.indexDirty ? ws.databases : null,
    schema: ws.schemaDirty ? ws.schema : null,
    files: ws.files
      .filter((f) => ws.dirty.has(f.path))
      .map((f) => ({ db: f.db, path: f.path, text: writeDbFile(f), isNew: f.original === null })),
  }
  try {
    if (!draft.files.length && !draft.databases && !draft.schema) await del(DRAFT_KEY)
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
  for (const f of ws.files) if (ws.dirty.has(f.path)) f.positions = parseDbFile(f.db, f.path, f.original!).positions
  ws.dirty.clear()
  ws.databases = JSON.parse(ws.originalIndex).databases
  ws.indexDirty = false
  ws.schema = parseSchema(ws.originalSchema)
  ws.schemaDirty = false
  setSchema(ws.schema)
  ws.version++
}

export function changeCount(ws: Workspace) {
  return ws.dirty.size + (ws.indexDirty ? 1 : 0) + (ws.schemaDirty ? 1 : 0)
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
  if (ws.schemaDirty) out.push({ path: 'db/schema.json', before: ws.originalSchema, after: writeSchema(ws.schema) })
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

/** Replaces the value schema (the Fields dialog). */
export function updateSchema(ws: Workspace, schema: Schema) {
  ws.schema = schema
  ws.schemaDirty = writeSchema(schema) !== ws.originalSchema
  setSchema(schema)
  ws.version++
}
