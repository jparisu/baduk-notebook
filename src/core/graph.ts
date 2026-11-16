/**
 * The merged position graph (SPEC §3.2): every SGF tree of every database is folded into one graph
 * whose nodes are canonical positions. Transpositions, mirrored lines and the same line repeated in
 * another database all land on the same node.
 */
import GoBoard from '@sabaki/go-board'
import type { SgfNode } from '@sabaki/sgf'
import { canonical } from './hash'
import { apply, compose, inverse, parseSgfPt, parseSgfPtList, transformMap, type Pt, type Sign, type SignMap, type Transform } from './geometry'
import { ENTRY_PROPS, MOVE_PROPS, categoryOf, type Category, type Props } from './fields'

/** Properties from one SGF node in one database, with the transform from that file's frame to the canonical frame. */
export interface Contribution {
  db: string
  props: Props
  toCanon: Transform
  /** The SGF node this came from (used by the editor to write changes back). */
  file: string
  node: SgfNode
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
}

export interface Entry {
  id: string
  type: 'joseki' | 'shape'
  root: string
  /** Root-node contributions (entry + position fields). The first one defines how the entry is shown by default. */
  contribs: Contribution[]
}

export interface Graph {
  nodes: Map<string, PosNode>
  entries: Map<string, Entry>
}

export interface SourceFile {
  db: string
  path: string
  roots: SgfNode[]
}

function split(data: Props) {
  const move: Props = {}, pos: Props = {}
  for (const [k, v] of Object.entries(data)) (MOVE_PROPS.has(k) ? move : pos)[k] = v
  return { move, pos }
}

function getNode(g: Graph, key: string, board: SignMap, toMove: Sign): PosNode {
  let n = g.nodes.get(key)
  if (!n) g.nodes.set(key, (n = { key, board, toMove, contribs: [], edges: [] }))
  return n
}

/** Signs of AB/AW/AE and the move of a node, applied to a board. */
function play(board: GoBoard, data: Props): { board: GoBoard; move: { sign: Sign; pt: Pt | null } | null } {
  for (const [prop, sign] of [['AB', 1], ['AW', -1], ['AE', 0]] as const)
    for (const v of data[prop] ?? []) for (const p of parseSgfPtList(v)) board = board.set(p, sign)
  for (const [prop, sign] of [['B', 1], ['W', -1]] as const) {
    if (!data[prop]) continue
    const pt = parseSgfPt(data[prop][0] ?? '')
    if (pt) board = board.makeMove(sign, pt)
    return { board, move: { sign, pt } }
  }
  return { board, move: null }
}

export function buildGraph(files: SourceFile[]): Graph {
  const g: Graph = { nodes: new Map(), entries: new Map() }
  let anon = 0

  for (const file of files)
    for (const root of file.roots) {
      const walk = (node: SgfNode, parentBoard: GoBoard, parent: { node: PosNode; toCanon: Transform } | null, toMove: Sign) => {
        const { board, move } = play(parentBoard, node.data)
        const nextToMove: Sign = move ? (-move.sign as Sign) : toMove
        const map = board.signMap as SignMap
        const { key, toCanon } = canonical(map, nextToMove)
        const pos = getNode(g, key, transformMap(toCanon, map), nextToMove ? (toCanon.swap ? (-nextToMove as Sign) : nextToMove) : 0)
        const { move: moveProps, pos: posProps } = split(node.data)

        if (parent && move) {
          const rel = compose(toCanon, inverse(parent.toCanon))
          let edge = parent.node.edges.find((e) => e.child === key)
          if (!edge) {
            const pt = move.pt ? apply(parent.toCanon, move.pt) : null
            const sign = (parent.toCanon.swap ? -move.sign : move.sign) as Sign
            parent.node.edges.push((edge = { child: key, sign, pt, rel, contribs: [] }))
          }
          edge.contribs.push({ db: file.db, props: moveProps, toCanon: parent.toCanon, file: file.path, node })
        }

        if (!parent) {
          const entryProps: Props = {}
          for (const [k, v] of Object.entries(posProps)) if (ENTRY_PROPS.has(k)) entryProps[k] = v
          // A file without XID/XNAME only adds notes or lines to positions defined elsewhere (SPEC §3.4).
          const named = entryProps.XID || entryProps.XNAME
          const id = entryProps.XID?.[0] ?? `${file.path}#${anon++}`
          let entry = named ? g.entries.get(id) : undefined
          if (named && !entry) {
            const type = entryProps.XTYPE?.[0] === 'shape' ? 'shape' : 'joseki'
            g.entries.set(id, (entry = { id, type, root: key, contribs: [] }))
          }
          entry?.contribs.push({ db: file.db, props: entryProps, toCanon, file: file.path, node })
          for (const k of Object.keys(entryProps)) delete posProps[k]
        }
        pos.contribs.push({ db: file.db, props: posProps, toCanon, file: file.path, node })

        for (const child of node.children) walk(child, board, { node: pos, toCanon }, nextToMove)
      }
      const pl = root.data.PL?.[0]
      walk(root, GoBoard.fromDimensions(19), null, pl === 'B' ? 1 : pl === 'W' ? -1 : 0)
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

/** Category of an edge: the value from the database listed last wins (SPEC §3.3). */
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
