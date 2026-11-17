/** Edit operations on the workspace (SPEC §8.3, §10). All coordinates are converted to the file's own frame. */
import GoBoard from '@sabaki/go-board'
import type { SgfNode } from '@sabaki/sgf'
import { apply, applySign, compose, inverse, transformMap, type Pt, type Sign, type Transform } from '../core/geometry'
import { canonical } from '../core/hash'
import type { Graph } from '../core/graph'
import { displayBoard, frame, type Ctx, type Step } from '../view'
import type { DatabaseInfo } from '../data/load'
import { findParent, newNode, sgfPoint } from './sgfio'
import type { WorkFile, Workspace } from './workspace'

export interface Location {
  file: WorkFile
  node: SgfNode
  /** Maps the file's frame to the canonical frame of this position. */
  T: Transform
}

const fileOf = (ws: Workspace, path: string) => ws.files.find((f) => f.path === path)!

function touch(ws: Workspace, f: WorkFile) {
  ws.dirty.add(f.path)
  ws.version++
}

function moveData(sign: Sign, pt: Pt | null): Record<string, string[]> {
  return { [sign === 1 ? 'B' : 'W']: [pt ? sgfPoint(pt) : ''] }
}
const sameMove = (n: SgfNode, d: Record<string, string[]>) => {
  const [k, v] = Object.entries(d)[0]
  return n.data[k]?.[0] === v[0]
}

/**
 * The SGF node of the target database for the last position of `path`.
 * With `create`, missing nodes (and, if needed, a new file) are created.
 */
export function locate(ws: Workspace, ctx: Ctx, path: Step[], target: string, entryId: string | null, create: boolean): Location | null {
  const g = ctx.graph
  let start = -1
  let loc: Location | null = null
  for (let i = path.length - 1; i >= 0 && !loc; i--) {
    const c = g.nodes.get(path[i].key)?.contribs.find((c) => c.db === target)
    if (c) {
      loc = { file: fileOf(ws, c.file), node: c.node, T: c.toCanon }
      start = i
    }
  }
  if (loc && start === path.length - 1) return loc
  if (!create) return null

  if (!loc) {
    // No file of the target database touches this line yet: start a new one at the line's first position.
    const entry = entryId ? g.entries.get(entryId) : undefined
    const root = ctx.graph.nodes.get(path[0].key) ?? { board: path[0].board!, toMove: path[0].toMove ?? 0 }
    const D = path[0].D // canonical → stored frame of the line's start
    const board = transformMap(D, root.board)
    const ab: string[] = [], aw: string[] = []
    board.forEach((row, y) => row.forEach((s, x) => s && (s === 1 ? ab : aw).push(sgfPoint([x, y]))))
    const toMove = applySign(D, root.toMove)
    const own = entry?.contribs.some((c) => c.db === target)
    const dir = entry?.type === 'shape' ? 'shapes' : 'joseki'
    const base = entryId && entry ? `${entryId}${own ? '' : '-notes'}` : ab.length + aw.length ? 'lines' : 'empty-corner-lines'
    let name = `${target}/${dir}/${base}.sgf`
    for (let n = 2; ws.files.some((f) => f.path === name); n++) name = `${target}/${dir}/${base}-${n}.sgf`
    const data: Record<string, string[]> = { FF: ['4'], CA: ['UTF-8'], GM: ['1'], SZ: ['19'] }
    // Keep the label of the start position, so the new moves inherit it.
    if (entryId && entry && entry.root === path[0].key) data.XID = [entryId]
    if (ab.length) data.AB = ab
    if (aw.length) data.AW = aw
    if (toMove) data.PL = [toMove === 1 ? 'B' : 'W']
    const file: WorkFile = { db: target, path: name, roots: [], original: null }
    const node = newNode(data, null)
    file.roots.push(node)
    ws.files.push(file)
    loc = { file, node, T: inverse(D) }
    start = 0
  }

  // Walk down the line, creating the moves that are missing in this file.
  let { node, T } = loc
  for (let j = start + 1; j < path.length; j++) {
    const e = path[j].edge ?? path[j].free!
    const pt = e.pt ? apply(inverse(T), e.pt) : null
    const sign = applySign(inverse(T), e.sign)
    const d = moveData(sign, pt)
    node = node.children.find((c) => sameMove(c, d)) ?? newNode(d, node)
    // parent canonical → child canonical, also for freely played moves
    T = compose(compose(inverse(path[j].D), path[j - 1].D), T)
  }
  touch(ws, loc.file)
  return { file: loc.file, node, T }
}

/** Sets or clears properties on a node. `null` or an empty list removes the property. */
export function setProps(ws: Workspace, loc: Location, values: Record<string, string[] | null>) {
  for (const [k, v] of Object.entries(values)) {
    if (!v || !v.length || v.every((x) => x === '')) delete loc.node.data[k]
    else loc.node.data[k] = v
  }
  touch(ws, loc.file)
}

export type MoveCheck = { ok: true; joins: boolean } | { ok: false; reason: string }

/** Checks a move in display coordinates: occupied point, suicide, ko. Also says whether the result is already known. */
export function checkMove(ctx: Ctx, path: Step[], sign: Sign, pt: Pt | null): MoveCheck {
  const step = path[path.length - 1]
  if (!pt) return { ok: true, joins: false }
  const board = new GoBoard(displayBoard(ctx, step))
  let next: GoBoard
  try {
    next = board.makeMove(sign, pt, { preventOverwrite: true, preventSuicide: true })
  } catch {
    return { ok: false, reason: board.get(pt) ? 'That point is occupied.' : 'That move would be suicide.' }
  }
  if (path.length >= 2) {
    const before = displayBoard(ctx, path[path.length - 2])
    if (JSON.stringify(before) === JSON.stringify(next.signMap)) return { ok: false, reason: 'Ko: retake elsewhere first.' }
  }
  const key = canonical(next.signMap as never, (-sign) as Sign).key
  return { ok: true, joins: ctx.graph.nodes.has(key) }
}

/** Adds a move (display coordinates; null = tenuki) after the current position. */
export function addMove(ws: Workspace, ctx: Ctx, path: Step[], target: string, entryId: string | null, sign: Sign, pt: Pt | null) {
  const F = frame(ctx, path[path.length - 1])
  const toCanon = inverse(F)
  const loc = locate(ws, ctx, path, target, entryId, true)!
  const canonPt = pt ? apply(toCanon, pt) : null
  const canonSign = applySign(toCanon, sign)
  const filePt = canonPt ? apply(inverse(loc.T), canonPt) : null
  const fileSign = applySign(inverse(loc.T), canonSign)
  const d = moveData(fileSign, filePt)
  const existing = loc.node.children.find((c) => sameMove(c, d))
  if (!existing) newNode(d, loc.node)
  touch(ws, loc.file)
  return { canonPt, canonSign }
}

/** Removes the target database's copy of the last move of `path` (and everything after it in that file). */
export function deleteMove(ws: Workspace, path: Step[], target: string): boolean {
  const e = path[path.length - 1].edge
  if (!e) return false
  let removed = false
  for (const c of e.contribs.filter((c) => c.db === target)) {
    const f = fileOf(ws, c.file)
    const parent = findParent(f.roots, c.node)
    if (!parent) continue
    parent.children = parent.children.filter((x) => x !== c.node)
    touch(ws, f)
    removed = true
  }
  return removed
}

export interface NewEntry {
  type: 'joseki' | 'shape'
  id: string
  name: string
  difficulty: string
  stones: { B: Pt[]; W: Pt[] }
  toMove: Sign
}

export function createEntry(ws: Workspace, target: string, e: NewEntry): string | null {
  const dir = e.type === 'shape' ? 'shapes' : 'joseki'
  const path = `${target}/${dir}/${e.id}.sgf`
  if (ws.files.some((f) => f.path === path)) return 'A file with this id already exists in this database.'
  const data: Record<string, string[]> = {
    FF: ['4'], CA: ['UTF-8'], GM: ['1'], SZ: ['19'],
    XID: [e.id], XTYPE: [e.type], XNAME: [e.name],
  }
  if (e.difficulty) data.XDIFF = [e.difficulty]
  if (e.type === 'joseki') data.XSTART = [e.stones.B.length + e.stones.W.length ? 'setup' : 'empty']
  if (e.stones.B.length) data.AB = e.stones.B.map(sgfPoint)
  if (e.stones.W.length) data.AW = e.stones.W.map(sgfPoint)
  if (e.toMove) data.PL = [e.toMove === 1 ? 'B' : 'W']
  data.XST = ['start']
  ws.files.push({ db: target, path, roots: [newNode(data, null)], original: null })
  ws.dirty.add(path)
  ws.version++
  return null
}

export function createDatabase(ws: Workspace, db: DatabaseInfo): string | null {
  if (!/^[a-z0-9-]+$/.test(db.id)) return 'Use lowercase letters, digits and hyphens for the id.'
  if (ws.databases.some((d) => d.id === db.id)) return 'A database with this id already exists.'
  ws.databases = [...ws.databases, db]
  ws.indexDirty = true
  ws.version++
  return null
}

/** Finds which entry and move a canonical position belongs to (for "joins an existing position"). */
export function describePosition(g: Graph, key: string): string | null {
  for (const e of g.entries.values()) {
    const seen = new Set<string>()
    const q: [string, number][] = [[e.root, 0]]
    while (q.length) {
      const [k, d] = q.shift()!
      if (k === key) return `${e.contribs.find((c) => c.props.XNAME)?.props.XNAME?.[0] ?? e.id}, move ${d}`
      if (seen.has(k)) continue
      seen.add(k)
      for (const ed of g.nodes.get(k)?.edges ?? []) q.push([ed.child, d + 1])
    }
  }
  return null
}
