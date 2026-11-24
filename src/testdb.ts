/** Test helpers: read the JSON databases from db/ (Node only). */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parseDbFile, type DbFile } from './core/model'
import { buildGraph } from './core/graph'
import { IDENTITY } from './core/geometry'
import type { Ctx } from './view'
import { mergeRegistries, parseRegistry, setRegistry } from './core/tags'

// The tag descriptions, as the app loads them before the databases.
const INDEX = JSON.parse(readFileSync('db/index.json', 'utf8')) as { databases: { id: string }[] }
setRegistry(mergeRegistries(INDEX.databases.filter((d) => existsSync(`db/${d.id}/tags.json`)).map((d) => ({ db: d.id, registry: parseRegistry(readFileSync(`db/${d.id}/tags.json`, 'utf8')) }))))
/** Each database's tags.json text, as the app loads it. */
export const tagTexts = (): Record<string, string> =>
  Object.fromEntries(INDEX.databases.filter((d) => existsSync(`db/${d.id}/tags.json`)).map((d) => [d.id, readFileSync(`db/${d.id}/tags.json`, 'utf8')]))

export function listDb(dir = 'db'): string[] {
  return readdirSync(dir).sort().flatMap((n) => {
    const full = join(dir, n)
    return statSync(full).isDirectory() ? listDb(full) : n.endsWith('.json') && n !== 'tags.json' && dir !== 'db' ? [relative('db', full).split(sep).join('/')] : []
  })
}
export const readDb = (path: string) => ({ db: path.split('/')[0], path, text: readFileSync(`db/${path}`, 'utf8') })
export const loadDb = (filter: (path: string) => boolean = () => true): DbFile[] =>
  listDb().filter(filter).map((p) => {
    const r = readDb(p)
    return parseDbFile(r.db, r.path, r.text)
  })
export function ctxOf(files: DbFile[], dbs = ['general', 'jparisu']): Ctx {
  return { graph: buildGraph(files), active: new Set(dbs), order: dbs, U: IDENTITY }
}
