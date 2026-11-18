/** Test helpers: read the JSON databases from db/ (Node only). */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parseDbFile, type DbFile } from './core/model'
import { buildGraph } from './core/graph'
import { IDENTITY } from './core/geometry'
import type { Ctx } from './view'
import { parseSchema, setSchema } from './core/schema'

// The value schema, as the app loads it before the databases.
setSchema(parseSchema(readFileSync('db/schema.json', 'utf8')))

export function listDb(dir = 'db'): string[] {
  return readdirSync(dir).sort().flatMap((n) => {
    const full = join(dir, n)
    return statSync(full).isDirectory() ? listDb(full) : n.endsWith('.json') && dir !== 'db' ? [relative('db', full).split(sep).join('/')] : []
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
