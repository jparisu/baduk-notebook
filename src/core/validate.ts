/** Database validator (SPEC §10.1 "Checks before export", §12.4). Used by the app and by CI. */
import GoBoard from '@sabaki/go-board'
import type { SgfNode } from '@sabaki/sgf'
import { CATEGORIES } from './fields'
import { parsePt, parseSgfPt, parseSgfPtList } from './geometry'

export interface Issue {
  severity: 'error' | 'warning'
  file: string
  node?: SgfNode
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
const POINT_LISTS = ['AB', 'AW', 'AE', 'TR', 'SQ', 'CR', 'MA', 'XVITAL', 'XREG', 'XTB', 'XTW', 'XCUT', 'XWEAK', 'XLAD']
const POINT_PAIRS = ['AR', 'LN', 'XWALL', 'XINF']
const TEXT = ['XMW', 'XMN', 'XPW', 'XPN', 'XAJI', 'XTEN', 'XRES', 'XSUM', 'XRULE']
const KNOWN = new Set([
  ...Object.keys(ENUMS), ...INTS, ...POINT_LISTS, ...POINT_PAIRS, ...TEXT,
  'FF', 'CA', 'GM', 'SZ', 'C', 'B', 'W', 'TE', 'BM', 'DO', 'IT', 'LB', 'XID', 'XNAME', 'XALIAS', 'XFAM', 'XDIFF', 'XTAG', 'XSRC',
  'XCOND', 'XLINK', 'XPB', 'XPBS', 'XEYE', 'XLIB', 'XMOYO', 'GN', 'PB', 'PW', 'KM', 'RU', 'DT', 'EV', 'RE', 'AP', 'ST', 'N', 'MN', 'HA',
])
const REF_TYPES = new Set(['TR', 'SQ', 'CR', 'MA', 'LB', 'AR', 'LN', 'WALL', 'INF', 'TB', 'TW', 'CUT'])

function checkRefs(text: string, push: (m: string) => void) {
  for (const m of text.matchAll(/\{\{([A-Z]+):([^|}]*)(?:\|[^}]*)?\}\}/g)) {
    if (!REF_TYPES.has(m[1])) push(`Unknown visual reference type "${m[1]}" in "${m[0]}"`)
    const pts = m[2].split(/[,\-:]/).map((p) => p.split('=')[0]).filter(Boolean)
    for (const p of pts) if (!parsePt(p)) push(`Invalid point "${p}" in "${m[0]}"`)
  }
  const opens = (text.match(/\{\{/g) ?? []).length, closes = (text.match(/\}\}/g) ?? []).length
  if (opens !== closes) push('Unbalanced {{ }} in text')
}

export function validateFile(db: string, path: string, roots: SgfNode[], known: Set<string>): Issue[] {
  const issues: Issue[] = []
  if (!known.has(db)) issues.push({ severity: 'error', file: path, message: `Folder "${db}" is not listed in db/index.json` })
  if (!/^[a-z0-9-]+\/(joseki|shapes)\/[a-z0-9._-]+\.sgf$/.test(path))
    issues.push({ severity: 'warning', file: path, message: 'Expected path db-id/joseki/name.sgf or db-id/shapes/name.sgf (lowercase)' })

  for (const root of roots) {
    const walk = (node: SgfNode, board: GoBoard, _isRoot: boolean) => {
      const err = (message: string, severity: Issue['severity'] = 'error') => issues.push({ severity, file: path, node, message })
      const d = node.data
      for (const [k, vals] of Object.entries(d)) {
        if (!KNOWN.has(k)) err(`Unknown property ${k}`, 'warning')
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
      if (d.XDIFF && !/^([1-9]|[12]\d|30)k$|^[1-9]d$/.test(d.XDIFF[0])) err(`XDIFF[${d.XDIFF[0]}] must look like 15k or 2d`)
      if (d.XPB && !Number.isFinite(Number(d.XPB[0]))) err(`XPB[${d.XPB[0]}] must be a number`)
      if (d.XID && !/^[a-z0-9-]+$/.test(d.XID[0])) err(`XID[${d.XID[0]}] must use lowercase letters, digits and hyphens`)
      if (d.XNAME && !d.XID) err('A name (XNAME) needs an id (XID)')
      if (d.B && d.W) err('A node cannot have both B and W')

      let next = board
      try {
        for (const [prop, sign] of [['AB', 1], ['AW', -1], ['AE', 0]] as const)
          for (const v of d[prop] ?? []) for (const p of parseSgfPtList(v)) next = next.set(p, sign)
        for (const [prop, sign] of [['B', 1], ['W', -1]] as const) {
          const v = d[prop]?.[0]
          if (v === undefined || v === '') continue
          const p = parseSgfPt(v)
          if (!p) err(`${prop}[${v}] is not a valid point`)
          else next = next.makeMove(sign, p, { preventOverwrite: true, preventSuicide: true })
        }
      } catch {
        err('Illegal move (point occupied or suicide)')
      }
      for (const c of node.children) walk(c, next, false)
    }
    walk(root, GoBoard.fromDimensions(19), true)
  }
  return issues
}

/** Validates every file; also checks that entry ids are unique inside a database. */
export function validateAll(files: { db: string; path: string; roots: SgfNode[] }[], known: Set<string>): Issue[] {
  const issues = files.flatMap((f) => validateFile(f.db, f.path, f.roots, known))
  const seen = new Map<string, string>()
  const visit = (f: { db: string; path: string }, n: SgfNode) => {
    const id = n.data.XID?.[0]
    if (id && n.data.XNAME) {
      const key = f.db + '/' + id
      if (seen.has(key)) issues.push({ severity: 'error', file: f.path, node: n, message: `The label "${id}" is already named in ${seen.get(key)}` })
      else seen.set(key, f.path)
    }
    n.children.forEach((c) => visit(f, c))
  }
  for (const f of files) for (const r of f.roots) visit(f, r)
  return issues
}
