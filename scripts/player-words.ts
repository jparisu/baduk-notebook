/**
 * Turns the words Black / White in database texts into {{Black}} / {{White}}, so they follow the
 * board's Swap colors option (docs/MODEL.md §1). Names and tags are left alone.
 * Run with: npx vite-node scripts/player-words.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseDbFile, writeDbFile } from '../src/core/model'
import { listDb } from '../src/testdb'

const TEXT = ['XMW', 'XMN', 'XPW', 'XPN', 'XAJI', 'XTEN', 'XRES', 'XSUM', 'XRULE', 'XEYE', 'C']
// A whole word, not already inside {{ }}.
const WORD = /(?<!\{\{)\b(Black|White|black|white)\b(?!\}\})/g

let count = 0
for (const path of listDb()) {
  const text = readFileSync(`db/${path}`, 'utf8')
  const f = parseDbFile(path.split('/')[0], path, text)
  const fix = (data: Record<string, string[]>) => {
    for (const k of TEXT)
      if (data[k]) data[k] = data[k].map((v) => v.replace(WORD, (w) => (count++, `{{${w}}}`)))
  }
  for (const p of f.positions) {
    fix(p.data)
    for (const m of p.moves) fix(m.data)
  }
  const out = writeDbFile(f)
  if (out !== text) writeFileSync(`db/${path}`, out)
}
console.log(`Replaced ${count} words.`)
