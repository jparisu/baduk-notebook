/** Database validator (SPEC §10.1 "Checks before export", §12.4). Used by the app and by CI. */
import type { DbFile } from './model'
import { buildGraph } from './graph'
import { playerWords } from './refs'
import { fieldOfProp, keyOf } from './schema'
import { parsePt, parseSgfPt, parseSgfPtList } from './geometry'

export interface Issue {
  severity: 'error' | 'warning'
  file: string
  id?: string
  message: string
}

const POINT_LISTS = ['TR', 'SQ', 'CR', 'MA', 'XTB', 'XTW', 'XCUT', 'XEYEM', 'XWEAK', 'XLAD', 'XMOYO']
const POINT_PAIRS = ['AR', 'LN', 'XWALL', 'XINF']
const TEXT = ['XMW', 'XPW', 'XSUM']
/** Properties that are not schema values. */
const OWN = new Set([...POINT_LISTS, ...POINT_PAIRS, ...TEXT, 'LB', 'XNAME', 'XTAG', 'XLINK'])
const REF_TYPES = new Set(['TR', 'SQ', 'CR', 'MA', 'LB', 'AR', 'LN', 'WALL', 'INF', 'TB', 'TW', 'CUT', 'EYE'])

function checkRefs(text: string, push: (m: string) => void) {
  text = playerWords(text, false, 1) // {{Black}}, {{Player}}… are words, not board references
  for (const m of text.matchAll(/\{\{([A-Z]+):([^|}]*)(?:\|[^}]*)?\}\}/g)) {
    if (!REF_TYPES.has(m[1])) push(`Unknown visual reference type "${m[1]}" in "${m[0]}"`)
    const pts = m[2].split(/[,\-:]/).map((p) => p.split('=')[0]).filter(Boolean)
    for (const p of pts) if (!parsePt(p)) push(`Invalid point "${p}" in "${m[0]}"`)
  }
  const opens = (text.match(/\{\{/g) ?? []).length, closes = (text.match(/\}\}/g) ?? []).length
  if (opens !== closes) push('Unbalanced {{ }} in text')
}

function checkProps(d: Record<string, string[]>, err: (m: string, sev?: Issue['severity']) => void) {
  for (const [k, vals] of Object.entries(d)) {
    if (POINT_LISTS.includes(k)) for (const v of vals) if (!parseSgfPtList(v).length) err(`${k}[${v}] is not a valid point`)
    if (POINT_PAIRS.includes(k))
      for (const v of vals) {
        const [a, b] = v.split(':')
        if (!a || !b || !parseSgfPt(a) || !parseSgfPt(b)) err(`${k}[${v}] must be two points like pd:qc`)
      }
    if (TEXT.includes(k)) for (const v of vals) checkRefs(v, (m) => err(m, 'warning'))
    if (OWN.has(k)) continue
    // Values: the schema (db/schema.json) says which keys exist and what they accept.
    const f = fieldOfProp(k)
    const key = keyOf(k)
    if (!f) {
      err(`Unknown key "${key}": add it to db/schema.json`, 'warning')
      continue
    }
    const opts = f.options?.map((o) => o.value) ?? []
    for (const v of vals) {
      if ((f.type === 'choice' || f.type === 'multi') && !opts.includes(v)) err(`${key}: "${v}" is not one of ${opts.join(', ')}`)
      if (f.type === 'slider' && !(Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 1)) err(`${key}: ${v} must be a number from -1 to 1`)
      if (f.type === 'color' && !['B', 'W', 'none'].includes(v)) err(`${key}: ${v} must be B, W or none`)
    }
    if (f.type === 'choice' && vals.length > 1) err(`${key} takes one value`)
  }
  if (d.XDIFF && !/^([1-9]|[12]\d|30)k$|^[1-9]d$/.test(d.XDIFF[0])) err(`difficulty ${d.XDIFF[0]} must look like 15k or 2d`)
  if (d.XPB && !Number.isFinite(Number(d.XPB[0]))) err(`balance ${d.XPB[0]} must be a number`)
}

/** Validates the JSON databases (docs/MODEL.md): fields, ids, and that every move leads where it says. */
export function validateAll(files: DbFile[], known: Set<string>): Issue[] {
  const issues: Issue[] = []
  for (const f of files) {
    if (!known.has(f.db)) issues.push({ severity: 'error', file: f.path, message: `Folder "${f.db}" is not listed in db/index.json` })
    if (!/^[a-z0-9-]+\/[a-z0-9._/-]+\.json$/.test(f.path)) issues.push({ severity: 'warning', file: f.path, message: 'Expected a lowercase path like db-id/joseki/name.json' })
    for (const p of f.positions) {
      const err = (message: string, severity: Issue['severity'] = 'error') => issues.push({ severity, file: f.path, id: p.id, message })
      if (!/^[^:]+(:\d+[a-z]*)?$/.test(p.id)) err(`Id "${p.id}" must look like "joseki/4-4 point" or "joseki/4-4 point:5"`)
      if (!['B', 'W'].includes(p.toPlay)) err('toPlay must be B or W')
      checkProps(p.data, err)
      for (const m of p.moves) {
        if (m.move !== 'tenuki' && !parseSgfPt(m.move)) err(`Invalid move "${m.move}"`)
        checkProps(m.data, (msg, sev) => err(`move ${m.move}: ${msg}`, sev))
      }
    }
  }
  const g = buildGraph(files)
  for (const pr of g.problems) issues.push({ severity: 'error', file: pr.file, id: pr.id, message: pr.message })
  // No two tenukis in a row.
  for (const f of files)
    for (const p of f.positions)
      for (const m of p.moves.filter((m) => m.move === 'tenuki')) {
        const next = files.find((x) => x.db === f.db && x.positions.some((q) => q.id === m.to))?.positions.find((q) => q.id === m.to)
        if (next?.moves.some((x) => x.move === 'tenuki')) issues.push({ severity: 'error', file: f.path, id: p.id, message: 'Two tenukis in a row' })
      }
  return issues
}
