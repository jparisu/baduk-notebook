/**
 * One-off conversion to the 0.2 data model (docs/MODEL.md): positions and moves as two lists, each with
 * comments and a free dictionary of tags. Converts every db file and turns db/schema.json into db/tags.json.
 * Run once: node scripts/migrate-0.2.mjs
 */
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/* ---- Tag definitions ---- */

const RENAME = { category: 'kind', style: 'intention', tags: 'topics' }
const SEQUENCE = new Set(['tags', 'eye-space', 'surrounded', 'outside-liberties', 'inside-stones', 'arrangement', 'ko-type', 'difficulty', 'sources', 'era'])
if (existsSync('db/schema.json')) {
  const schema = JSON.parse(readFileSync('db/schema.json', 'utf8'))
  const tags = [
    { key: 'name', label: 'Name', for: 'position', type: 'list', panel: 'sequence', hint: 'The first name is the title; the others are other names.' },
  ]
  for (const f of schema.fields) {
    if (f.key === 'summary' || f.key === 'aliases') continue // they become a comment and more names
    const d = { ...f, key: RENAME[f.key] ?? f.key, for: f.for === 'sequence' ? 'position' : f.for }
    if (SEQUENCE.has(f.key)) d.panel = 'sequence'
    if (f.key === 'category') {
      d.label = 'Kind'
      d.suggest = true
    }
    if (f.key === 'style') {
      d.label = 'Intention'
      d.type = 'multi'
    }
    if (f.key === 'tags') d.label = 'Topics'
    if (f.key === 'difficulty') d.type = 'rank'
    tags.push(d)
  }
  tags.push({ key: 'board', label: 'On the board', type: 'board', hint: 'Shapes drawn on the board: TR:Q16, AR:Q16-R17, LB:Q16=A, EYE:S18…' })
  writeFileSync('db/tags.json', JSON.stringify({ tags }, null, 2) + '\n')
  rmSync('db/schema.json')
}

/* ---- Database files ---- */

const COLS = 'ABCDEFGHJKLMNOPQRST'
const human = (sgf) => `${COLS[sgf.charCodeAt(0) - 97]}${19 - (sgf.charCodeAt(1) - 97)}`
const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v])

/** Old board drawings (SGF-style) as board tag entries in the reference syntax. */
function board(marks) {
  const out = []
  const ref = { XWALL: 'WALL', XINF: 'INF', XTB: 'TB', XTW: 'TW', XCUT: 'CUT', XEYEM: 'EYE' }
  for (const [k, v] of Object.entries(marks ?? {})) {
    const vals = list(v)
    const type = ref[k] ?? k
    if (['AR', 'LN', 'XWALL', 'XINF'].includes(k)) out.push(`${type}:${vals.map((x) => x.split(':').map(human).join('-')).join(',')}`)
    else if (k === 'LB') out.push(`LB:${vals.map((x) => `${human(x.split(':')[0])}=${x.split(':')[1] ?? ''}`).join(',')}`)
    else out.push(`${type}:${vals.map((x) => x.split(':').map(human).join(':')).join(',')}`)
  }
  return out
}

function tagsOf(values, extra = {}) {
  const t = { ...extra }
  for (const [k, v] of Object.entries(values ?? {})) {
    if (k === 'summary' || k === 'aliases') continue
    const key = RENAME[k] ?? k
    t[key] = key === 'intention' ? list(v) : v
  }
  return t
}

function convert(text) {
  const j = JSON.parse(text)
  if (j.moves) return null // already converted
  const positions = [], moves = []
  for (const p of j.positions ?? []) {
    const v = p.values ?? {}
    const names = [...list(p.name), ...list(v.aliases)]
    const comments = [...list(v.summary), ...list(p.notes)]
    const tags = tagsOf(v, names.length ? { name: names } : {})
    const b = board(p.marks)
    if (b.length) tags.board = b
    const out = { id: p.id, stones: p.stones, toPlay: p.toPlay }
    if (p.free && p.free !== 'corner') out.free = p.free
    if (comments.length) out.comments = comments
    if (Object.keys(tags).length) out.tags = tags
    positions.push(out)
    for (const m of p.moves ?? []) {
      const mo = { from: p.id, to: m.to }
      if (m.notes?.length) mo.comments = list(m.notes)
      const mt = tagsOf(m.values)
      const mb = board(m.marks)
      if (mb.length) mt.board = mb
      if (Object.keys(mt).length) mo.tags = mt
      moves.push(mo)
    }
  }
  return JSON.stringify({ positions, moves }, null, 2) + '\n'
}

const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : dir !== 'db' && n.endsWith('.json') ? [join(dir, n)] : []))
for (const file of walk('db')) {
  const out = convert(readFileSync(file, 'utf8'))
  if (out) writeFileSync(file, out)
}
