/**
 * Editing workspace (SPEC §10): the working copy of every database file, which files changed,
 * drafts saved in IndexedDB, and export as a patch or zip.
 */
import * as sgf from '@sabaki/sgf'
import type { SgfNode } from '@sabaki/sgf'
import { get, set, del } from 'idb-keyval'
import { structuredPatch } from 'diff'
import type { DatabaseInfo } from '../data/load'
import { writeSgf } from './sgfio'
import { storageKey } from '../storage'

export interface WorkFile {
  db: string
  path: string // relative to db/, e.g. "general/joseki/x.sgf"
  roots: SgfNode[]
  /** Text as loaded from the site, or null for a file created in the app. */
  original: string | null
}

export interface Workspace {
  files: WorkFile[]
  databases: DatabaseInfo[]
  originalIndex: string
  dirty: Set<string>
  indexDirty: boolean
  version: number
}

const DRAFT_KEY = storageKey('baduk-notebook.drafts.v1')

interface Draft {
  databases: DatabaseInfo[] | null
  files: { db: string; path: string; text: string; isNew: boolean }[]
}

export function createWorkspace(databases: DatabaseInfo[], loaded: { db: string; path: string; text: string }[]): Workspace {
  return {
    files: loaded.map((f) => ({ db: f.db, path: f.path, roots: sgf.parse(f.text), original: f.text })),
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
  if (draft.databases) {
    ws.databases = draft.databases
    ws.indexDirty = true
  }
  for (const f of draft.files) {
    const roots = sgf.parse(f.text)
    const existing = ws.files.find((x) => x.path === f.path)
    if (existing) existing.roots = roots
    else ws.files.push({ db: f.db, path: f.path, roots, original: null })
    ws.dirty.add(f.path)
  }
  ws.version++
  return draft.files.length + (draft.databases ? 1 : 0)
}

export async function saveDrafts(ws: Workspace) {
  const draft: Draft = {
    databases: ws.indexDirty ? ws.databases : null,
    files: ws.files
      .filter((f) => ws.dirty.has(f.path))
      .map((f) => ({ db: f.db, path: f.path, text: writeSgf(f.roots), isNew: f.original === null })),
  }
  try {
    if (!draft.files.length && !draft.databases) await del(DRAFT_KEY)
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
  for (const f of ws.files) if (ws.dirty.has(f.path)) f.roots = sgf.parse(f.original!)
  ws.dirty.clear()
  ws.databases = JSON.parse(ws.originalIndex).databases
  ws.indexDirty = false
  ws.version++
}

export function changeCount(ws: Workspace) {
  return ws.dirty.size + (ws.indexDirty ? 1 : 0)
}

/* ---- Export ---- */

export interface Change {
  path: string // repository path, e.g. "db/general/joseki/x.sgf"
  before: string | null
  after: string
}

export function changes(ws: Workspace, onlyDbs?: Set<string>): Change[] {
  const out: Change[] = []
  if (ws.indexDirty) out.push({ path: 'db/index.json', before: ws.originalIndex, after: indexText(ws.databases) })
  for (const f of ws.files) {
    if (!ws.dirty.has(f.path) || (onlyDbs && !onlyDbs.has(f.db))) continue
    const after = writeSgf(f.roots)
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
