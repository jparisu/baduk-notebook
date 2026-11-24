import { parseDbFile, type DbFile } from '../core/model'
import { parseRegistry, setRegistry } from '../core/tags'

export interface DatabaseInfo {
  id: string
  name: string
  description: string
  color: string
  activeByDefault: boolean
  /** Topics that are often used to find positions (docs/MODEL.md §4). */
  commonTags?: string[]
}

const base = import.meta.env.BASE_URL

// Always revalidate with the server: GitHub Pages lets browsers reuse files for 10 minutes,
// so right after a deploy a cached files.json could list files of the previous version.
const fetchFresh = (url: string) => fetch(url, { cache: 'no-cache' })

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchFresh(url)
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`)
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch (e) {
    throw new Error(`${url} is not valid JSON: ${(e as Error).message}`)
  }
}

/** Loads db/index.json, db/tags.json, db/files.json and every JSON file of the listed databases. */
export async function loadDatabases(): Promise<{ databases: DatabaseInfo[]; files: DbFile[]; texts: { db: string; path: string; text: string }[]; tagsText: string }> {
  const { databases } = await getJson<{ databases: DatabaseInfo[] }>(`${base}db/index.json`)
  // The tag descriptions first: the panels read the files through them.
  const tres = await fetchFresh(`${base}db/tags.json`)
  const tagsText = tres.ok ? await tres.text() : '{ "tags": [] }\n'
  setRegistry(parseRegistry(tagsText))
  const list = await getJson<string[]>(`${base}db/files.json`)
  const known = new Set(databases.map((d) => d.id))
  const wanted = list.filter((path) => path.endsWith('.json') && known.has(path.split('/')[0]))
  const loaded = await Promise.all(
    wanted.map(async (path) => {
      const res = await fetchFresh(`${base}db/${path}`)
      if (!res.ok) throw new Error(`Could not load db/${path} (${res.status})`)
      return { db: path.split('/')[0], path, text: await res.text() }
    }),
  )
  // Keep the database order of index.json so "later wins" is stable.
  const order = databases.map((d) => d.id)
  loaded.sort((a, b) => order.indexOf(a.db) - order.indexOf(b.db) || a.path.localeCompare(b.path))
  const files = loaded.map((f) => {
    try {
      return parseDbFile(f.db, f.path, f.text)
    } catch (e) {
      throw new Error(`db/${f.path} is not valid JSON: ${(e as Error).message}`)
    }
  })
  return { databases, files, texts: loaded, tagsText }
}
