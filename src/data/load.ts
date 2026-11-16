import * as sgf from '@sabaki/sgf'

export interface DatabaseInfo {
  id: string
  name: string
  description: string
  color: string
  activeByDefault: boolean
}

import type { SourceFile } from '../core/graph'

const base = import.meta.env.BASE_URL

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`)
  return res.json() as Promise<T>
}

/** Loads db/index.json, db/files.json and every SGF file of the listed databases. */
export async function loadDatabases(): Promise<{ databases: DatabaseInfo[]; files: SourceFile[] }> {
  const { databases } = await getJson<{ databases: DatabaseInfo[] }>(`${base}db/index.json`)
  const files = await getJson<string[]>(`${base}db/files.json`)
  const known = new Set(databases.map((d) => d.id))
  const wanted = files.filter((path) => known.has(path.split('/')[0]))
  const loaded = await Promise.all(
    wanted.map(async (path) => {
      const res = await fetch(`${base}db/${path}`)
      if (!res.ok) throw new Error(`Could not load db/${path} (${res.status})`)
      return { db: path.split('/')[0], path, roots: sgf.parse(await res.text()) }
    }),
  )
  // Keep the database order of index.json so "later wins" is stable.
  const order = databases.map((d) => d.id)
  loaded.sort((a, b) => order.indexOf(a.db) - order.indexOf(b.db))
  return { databases, files: loaded }
}
