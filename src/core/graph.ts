/**
 * The merged position graph (docs/MODEL.md): the positions of every database file are folded into one
 * graph whose nodes are canonical positions (8 symmetries). The same position stored in two databases
 * is one node; transpositions and mirrored lines land on the same node too.
 */
import GoBoard from '@sabaki/go-board'
import { canonical } from './hash'
import { apply, compose, inverse, transformMap, type Pt, type Sign, type SignMap, type Transform } from './geometry'
import { CATEGORIES, categoryOf, type Category, type Props } from './fields'
import { boardOf, isStartId, movePt, seqOf, signOf, type DbFile, type Free, type MoveRec, type PosRec } from './model'

/** Fields from one database record (a position or a move), with the transform from its stored frame to the canonical frame. */
export interface Contribution {
  db: string
  props: Props
  toCanon: Transform
  file: string
  /** The record that holds `props` (a position or a move); editors write into `node.data`. */
  node: { data: Props }
  /** The position record: the position itself, or the one a move starts from. */
  pos: PosRec
  move?: MoveRec
  /** Sequence of the position (the id without ":N"). */
  label?: string
}

export interface Edge {
  child: string
  /** Move color and point in the parent's canonical frame (point null = tenuki). */
  sign: Sign
  pt: Pt | null
  /** Maps the parent's canonical frame to the child's canonical frame. */
  rel: Transform
  contribs: Contribution[]
}

export interface PosNode {
  key: string
  board: SignMap // canonical frame
  toMove: Sign
  contribs: Contribution[]
  edges: Edge[]
  /** Moves into this position (keys of the parents). */
  parents: string[]
}

/** A sequence (docs/MODEL.md §3): its start is the position whose id has no ":N". */
export interface Entry {
  id: string
  type: 'joseki' | 'shape'
  root: string
  defined: boolean
  /** Start-position contributions. The first one decides how the sequence is shown by default. */
  contribs: Contribution[]
  /** The move into the start is not a good move (a mistake, overplay or trick sequence). */
  mistake: boolean
}

export interface Problem {
  file: string
  id: string
  message: string
}

export interface Graph {
  nodes: Map<string, PosNode>
  entries: Map<string, Entry>
  /** N of every position: moves on the shortest path from a starting position. */
  depth: Map<string, number>
  /** Position key of every id, per database ("db|id"). */
  ids: Map<string, string>
  problems: Problem[]
}

export const freeOf = (n: PosNode | undefined): Free => n?.contribs[0]?.pos.free ?? 'corner'

export function buildGraph(files: DbFile[]): Graph {
  const g: Graph = { nodes: new Map(), entries: new Map(), depth: new Map(), ids: new Map(), problems: [] }
  const placed = new Map<PosRec, { key: string; toCanon: Transform; board: SignMap; toMove: Sign; file: DbFile }>()

  // 1. Positions.
  for (const f of files)
    for (const p of f.positions) {
      const board = boardOf(p.stones)
      const toMove = signOf(p.toPlay)
      const { key, toCanon } = canonical(board, toMove)
      if (g.ids.has(`${f.db}|${p.id}`)) g.problems.push({ file: f.path, id: p.id, message: `The id "${p.id}" is used twice in ${f.db}` })
      g.ids.set(`${f.db}|${p.id}`, key)
      placed.set(p, { key, toCanon, board, toMove, file: f })
      let n = g.nodes.get(key)
      if (!n) g.nodes.set(key, (n = { key, board: transformMap(toCanon, board), toMove, contribs: [], edges: [], parents: [] }))
      const label = seqOf(p.id)
      const c: Contribution = { db: f.db, props: p.data, toCanon, file: f.path, node: p, pos: p, label }
      n.contribs.push(c)
      if (isStartId(p.id)) {
        let e = g.entries.get(label)
        if (!e) g.entries.set(label, (e = { id: label, type: label.startsWith('joseki') ? 'joseki' : 'shape', root: key, defined: true, contribs: [], mistake: false }))
        e.contribs.push(c)
      }
    }

  // 2. Moves.
  for (const [p, at] of placed)
    for (const m of p.moves) {
      const pt = movePt(m.move)
      if (m.move !== 'tenuki' && !pt) {
        g.problems.push({ file: at.file.path, id: p.id, message: `Invalid move "${m.move}"` })
        continue
      }
      let next: SignMap = at.board
      if (pt) {
        try {
          next = new GoBoard(at.board).makeMove(at.toMove, pt, { preventOverwrite: true, preventSuicide: true }).signMap as SignMap
        } catch {
          g.problems.push({ file: at.file.path, id: p.id, message: `Illegal move ${m.move}` })
          continue
        }
      }
      const { key, toCanon } = canonical(next, -at.toMove as Sign)
      const target = g.ids.get(`${at.file.db}|${m.to}`)
      if (!target) g.problems.push({ file: at.file.path, id: p.id, message: `Move ${m.move} points to "${m.to}", which is not in ${at.file.db}` })
      else if (target !== key) g.problems.push({ file: at.file.path, id: p.id, message: `Move ${m.move} does not lead to "${m.to}"` })
      let child = g.nodes.get(key)
      if (!child) g.nodes.set(key, (child = { key, board: transformMap(toCanon, next), toMove: -at.toMove as Sign, contribs: [], edges: [], parents: [] }))
      const parent = g.nodes.get(at.key)!
      let edge = parent.edges.find((e) => e.child === key)
      if (!edge) {
        parent.edges.push((edge = { child: key, sign: at.toMove, pt: pt ? apply(at.toCanon, pt) : null, rel: compose(toCanon, inverse(at.toCanon)), contribs: [] }))
        child.parents.push(at.key)
      }
      edge.contribs.push({ db: at.file.db, props: m.data, toCanon: at.toCanon, file: at.file.path, node: m, pos: p, move: m, label: seqOf(p.id) })
    }

  // 3. N: shortest distance from the starting positions (no move into them).
  const queue = [...g.nodes.values()].filter((n) => !n.parents.length).map((n) => n.key)
  for (const k of queue) g.depth.set(k, 0)
  for (let i = 0; i < queue.length; i++) {
    const d = g.depth.get(queue[i])!
    for (const e of g.nodes.get(queue[i])!.edges)
      if (!g.depth.has(e.child)) {
        g.depth.set(e.child, d + 1)
        queue.push(e.child)
      }
  }

  // 4. Sequences that start with a bad move.
  for (const e of g.entries.values()) {
    const into = [...g.nodes.get(e.root)!.parents].flatMap((pk) => g.nodes.get(pk)!.edges.filter((ed) => ed.child === e.root))
    const cats = into.flatMap((ed) => ed.contribs.map((c) => categoryOf(c.props))).filter((c): c is Category => !!c)
    e.mistake = cats.length > 0 && cats.every((c) => !CATEGORIES[c].good)
  }
  return g
}

/* ---- Queries that respect active databases ---- */

export const visibleContribs = (cs: Contribution[], active: Set<string>) => cs.filter((c) => active.has(c.db))

export function visibleEdges(g: Graph, key: string, active: Set<string>): Edge[] {
  const n = g.nodes.get(key)
  if (!n) return []
  return n.edges.filter((e) => e.contribs.some((c) => active.has(c.db)))
}

/** Category of an edge: the value from the database listed last wins, so personal databases override the general one. */
export function edgeCategory(e: Edge, active: Set<string>, order: string[]): Category | null {
  let best: Category | null = null, rank = -1
  for (const c of e.contribs) {
    if (!active.has(c.db)) continue
    const cat = categoryOf(c.props)
    const r = order.indexOf(c.db)
    if (cat && r >= rank) {
      best = cat
      rank = r
    }
  }
  return best
}

/** Sequences of a position, from active databases. */
export function labelsAt(g: Graph, key: string, active: Set<string>): string[] {
  const n = g.nodes.get(key)
  if (!n) return []
  return [...new Set(n.contribs.filter((c) => active.has(c.db) && c.label).map((c) => c.label!))]
}
