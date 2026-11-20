import { parseDbFile, type DbFile } from '../core/model'
import { parseSchema, setSchema } from '../core/schema'

export interface DatabaseInfo {
  id: string
  name: string
  description: string
  color: string
  activeByDefault: boolean
  /** Tags that are often used to find positions (docs/MODEL.md §3). */
  commonTags?: string[]
}

const base = import.meta.env.BASE_URL

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`)
  return res.json() as Promise<T>
}

/** Loads db/index.json, db/files.json and every JSON file of the listed databases. */
export async function loadDatabases(): Promise<{ databases: DatabaseInfo[]; files: DbFile[]; texts: { db: string; path: string; text: string }[]; schemaText: string }> {
  const { databases } = await getJson<{ databases: DatabaseInfo[] }>(`${base}db/index.json`)
  // The value schema first: reading the files needs it.
  const sres = await fetch(`${base}db/schema.json`)
  const schemaText = sres.ok ? await sres.text() : '{ "fields": [] }\n'
  setSchema(parseSchema(schemaText))
  const list = await getJson<string[]>(`${base}db/files.json`)
  const known = new Set(databases.map((d) => d.id))
  const wanted = list.filter((path) => known.has(path.split('/')[0]))
  const loaded = await Promise.all(
    wanted.map(async (path) => {
      const res = await fetch(`${base}db/${path}`)
      if (!res.ok) throw new Error(`Could not load db/${path} (${res.status})`)
      return { db: path.split('/')[0], path, text: await res.text() }
    }),
  )
  // Keep the database order of index.json so "later wins" is stable.
  const order = databases.map((d) => d.id)
  loaded.sort((a, b) => order.indexOf(a.db) - order.indexOf(b.db) || a.path.localeCompare(b.path))
  return { databases, files: loaded.map((f) => parseDbFile(f.db, f.path, f.text)), texts: loaded, schemaText }
}
