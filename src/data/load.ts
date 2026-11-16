import * as sgf from '@sabaki/sgf'
import type { SgfNode } from '@sabaki/sgf'

export interface DatabaseInfo {
  id: string
  name: string
  description: string
  color: string
  activeByDefault: boolean
}

export interface LoadedEntry {
  database: string
  path: string
  root: SgfNode
}

const base = import.meta.env.BASE_URL

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`)
  return res.json() as Promise<T>
}

/** Loads db/index.json, db/files.json and every SGF file of the listed databases. */
export async function loadDatabases(): Promise<{ databases: DatabaseInfo[]; entries: LoadedEntry[] }> {
  const { databases } = await getJson<{ databases: DatabaseInfo[] }>(`${base}db/index.json`)
  const files = await getJson<string[]>(`${base}db/files.json`)
  const known = new Set(databases.map((d) => d.id))
  const entries: LoadedEntry[] = []
  for (const path of files) {
    const database = path.split('/')[0]
    if (!known.has(database)) continue
    const res = await fetch(`${base}db/${path}`)
    if (!res.ok) throw new Error(`Could not load db/${path} (${res.status})`)
    for (const root of sgf.parse(await res.text())) entries.push({ database, path, root })
  }
  return { databases, entries }
}
