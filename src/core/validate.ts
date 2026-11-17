/** Database validator (SPEC §10.1 "Checks before export", §12.4). Used by the app and by CI. */
import type { DbFile } from './model'
import { buildGraph } from './graph'
import { playerWords } from './refs'
import { CATEGORIES } from './fields'
import { parsePt, parseSgfPt, parseSgfPtList } from './geometry'

export interface Issue {
  severity: 'error' | 'warning'
  file: string
  id?: string
  message: string
}

const ENUMS: Record<string, string[]> = {
  XTYPE: ['joseki', 'shape'],
  XCAT: Object.keys(CATEGORIES),
  XSTY: ['aggressive', 'balanced', 'solid'],
  XST: ['start', 'progress', 'end', 'end-mistake'],
  XEV: ['B++', 'B+', '=', 'W+', 'W++'],
  XSEN: ['B', 'W', 'none'],
  XSTART: ['empty', 'setup'],
  XLOC: ['corner', 'side', 'center'],
  XSURR: ['full', 'partial', 'open'],
  XARR: ['connected', 'separated'],
  XRESB: ['alive', 'dead', 'ko', 'seki', 'unsettled'],
  XRESW: ['alive', 'dead', 'ko', 'seki', 'unsettled'],
  XSB: ['alive', 'dead', 'ko', 'seki', 'unsettled'],
  XSW: ['alive', 'dead', 'ko', 'seki', 'unsettled'],
  XKOT: ['direct', 'approach1', 'approach2', '10000year'],
  XPUR: ['territory', 'influence', 'sente', 'attack', 'defend', 'sabaki', 'probe', 'reduce', 'connect', 'cut', 'eye', 'kill'],
  XERA: ['classic', 'modern', 'ai'],
  PL: ['B', 'W'],
}
const INTS = ['XSIZE', 'XOLIB', 'XINSIDE']
const POINT_LISTS = ['AB', 'AW', 'AE', 'TR', 'SQ', 'CR', 'MA', 'XVITAL', 'XREG', 'XTB', 'XTW', 'XCUT', 'XEYEM', 'XWEAK', 'XLAD']
const POINT_PAIRS = ['AR', 'LN', 'XWALL', 'XINF']
const TEXT = ['XMW', 'XMN', 'XPW', 'XPN', 'XAJI', 'XTEN', 'XRES', 'XSUM', 'XRULE']
const KNOWN = new Set([
  ...Object.keys(ENUMS), ...INTS, ...POINT_LISTS, ...POINT_PAIRS, ...TEXT,
  'FF', 'CA', 'GM', 'SZ', 'C', 'B', 'W', 'TE', 'BM', 'DO', 'IT', 'LB', 'XID', 'XNAME', 'XALIAS', 'XFAM', 'XDIFF', 'XTAG', 'XSRC',
  'XCOND', 'XLINK', 'XPB', 'XPBS', 'XEYE', 'XLIB', 'XMOYO', 'GN', 'PB', 'PW', 'KM', 'RU', 'DT', 'EV', 'RE', 'AP', 'ST', 'N', 'MN', 'HA',
])
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
    if (!KNOWN.has(k)) err(`Unknown field ${k}`, 'warning')
    if (ENUMS[k]) for (const v of vals) if (!ENUMS[k].includes(v)) err(`${k}[${v}]: allowed values are ${ENUMS[k].join(', ')}`)
    if (INTS.includes(k)) for (const v of vals) if (!/^\d+$/.test(v)) err(`${k}[${v}] must be a whole number`)
    if (POINT_LISTS.includes(k)) for (const v of vals) if (!parseSgfPtList(v).length) err(`${k}[${v}] is not a valid point`)
    if (POINT_PAIRS.includes(k))
      for (const v of vals) {
        const [a, b] = v.split(':')
        if (!a || !b || !parseSgfPt(a) || !parseSgfPt(b)) err(`${k}[${v}] must be two points like pd:qc`)
      }
    if (TEXT.includes(k) || k === 'C') for (const v of vals) checkRefs(v, (m) => err(m, 'warning'))
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
