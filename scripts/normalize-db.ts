/** Rewrites every database file with the app's own writer (stable field order). Run: npx vite-node scripts/normalize-db.ts */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseDbFile, writeDbFile } from '../src/core/model'
import { listDb } from '../src/testdb'

for (const path of listDb()) {
  const text = readFileSync(`db/${path}`, 'utf8')
  const out = writeDbFile(parseDbFile(path.split('/')[0], path, text))
  if (out !== text) writeFileSync(`db/${path}`, out)
}
