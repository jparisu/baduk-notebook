/** Database validator (docs/MODEL.md §9). Used by the app before export and by CI. */
import type { DbFile, Rec } from './model'
import { buildGraph } from './graph'
import { MARK_TYPES, playerWords } from './refs'
import { asList, defOf, type TagValue } from './tags'
import { parsePt } from './geometry'

export interface Issue {
  severity: 'error' | 'warning'
  file: string
  id?: string
  message: string
}

const REF_TYPES = new Set<string>(MARK_TYPES)
export const RANK = /^([1-9]|[12]\d|30)k$|^[1-9]d$|^[1-9]p$/

function checkPoints(body: string, where: string, push: (m: string) => void) {
  const pts = body.split(/[,\-:]/).map((p) => p.split('=')[0]).filter(Boolean)
  for (const p of pts) if (!parsePt(p)) push(`Invalid point "${p}" in "${where}"`)
}

function checkRefs(text: string, push: (m: string) => void) {
  text = playerWords(text, false, 1) // {{Black}}, {{Player}}… are words, not board references
  for (const m of text.matchAll(/\{\{([A-Z]+):([^|}]*)(?:\|[^}]*)?\}\}/g)) {
    if (!REF_TYPES.has(m[1])) push(`Unknown visual reference type "${m[1]}" in "${m[0]}"`)
    checkPoints(m[2], m[0], push)
  }
  const opens = (text.match(/\{\{/g) ?? []).length, closes = (text.match(/\}\}/g) ?? []).length
  if (opens !== closes) push('Unbalanced {{ }} in text')
}

/** A tag's value against its description in db/tags.json. Keys that are not described accept any plain value. */
export function checkTag(key: string, v: TagValue, err: (m: string) => void) {
  const ok = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || (Array.isArray(v) && v.every((x) => typeof x === 'string'))
  if (!ok) return err(`${key}: a tag holds text, a number, true/false or a list of texts`)
  const d = defOf(key)
  if (!d) return
  const opts = d.options?.map((o) => o.value) ?? []
  const vals = asList(v)
  switch (d.type) {
    case 'choice':
      if (Array.isArray(v)) err(`${key} takes one value`)
      for (const x of vals) if (!opts.includes(x)) err(`${key}: "${x}" is not one of ${opts.join(', ')}`)
      break
    case 'multi':
      for (const x of vals) if (!opts.includes(x)) err(`${key}: "${x}" is not one of ${opts.join(', ')}`)
      break
    case 'slider':
      if (typeof v !== 'number' || Math.abs(v) > 1) err(`${key}: ${v} must be a number from -1 to 1`)
      break
    case 'number':
      if (typeof v !== 'number') err(`${key}: ${v} must be a number`)
      break
    case 'flag':
      if (typeof v !== 'boolean') err(`${key}: must be true or false`)
      break
    case 'color':
      if (!['B', 'W', 'none'].includes(String(v))) err(`${key}: ${v} must be B, W or none`)
      break
    case 'rank':
      if (!RANK.test(String(v))) err(`${key}: ${v} must look like 15k, 2d or 1p`)
      break
    case 'board':
      for (const e of vals) {
        const m = e.match(/^([A-Z]{2,4}):(.+)$/)
        if (!m || !REF_TYPES.has(m[1])) err(`${key}: "${e}" must look like TR:Q16 or AR:Q16-R14`)
        else checkPoints(m[2], e, err)
      }
  }
}

function checkRec(r: Rec, err: (m: string, sev?: Issue['severity']) => void) {
  for (const c of r.comments) checkRefs(c, (m) => err(m, 'warning'))
  for (const [k, v] of Object.entries(r.tags)) checkTag(k, v, err)
}

/** Validates the JSON databases: ids, tags, and that every move goes from one position to the next. */
export function validateAll(files: DbFile[], known: Set<string>): Issue[] {
  const issues: Issue[] = []
  for (const f of files) {
    if (!known.has(f.db)) issues.push({ severity: 'error', file: f.path, message: `Folder "${f.db}" is not listed in db/index.json` })
    if (!/^[a-z0-9-]+\/[a-z0-9._/-]+\.json$/.test(f.path)) issues.push({ severity: 'warning', file: f.path, message: 'Expected a lowercase path like db-id/joseki/name.json' })
    for (const p of f.positions) {
      const err = (message: string, severity: Issue['severity'] = 'error') => issues.push({ severity, file: f.path, id: p.id, message })
      if (!/^[^:]+(:\d+[a-z]*)?$/.test(p.id)) err(`Id "${p.id}" must look like "joseki/4-4 point" or "joseki/4-4 point:5"`)
      if (!['B', 'W'].includes(p.toPlay)) err('toPlay must be B or W')
      checkRec(p, err)
      for (const m of p.moves) checkRec(m, (msg, sev) => err(`move to ${m.to}: ${msg}`, sev))
    }
  }
  const g = buildGraph(files)
  for (const pr of g.problems) issues.push({ severity: 'error', file: pr.file, id: pr.id, message: pr.message })
  return issues
}
