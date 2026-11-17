/**
 * SGF compatibility (docs/MODEL.md §7): download a position and what follows it as SGF, and load an
 * SGF file into a database (each node becomes a position, each move a move; comments become notes).
 */
import * as sgf from '@sabaki/sgf'
import type { SgfNode } from '@sabaki/sgf'
import { parseSgfPt, parseSgfPtList, type Pt, type Sign } from '../core/geometry'
import { MOVE_PROPS } from '../core/fields'
import { playerWords } from '../core/refs'
import { candidates, displayBoard, frame, moveFields, playFree, positionFields, startStep, toMove, type Ctx, type Step } from '../view'
import { newNode, sgfPoint, writeSgf } from './sgfio'
import { locate, setProps } from './ops'
import { buildGraph } from '../core/graph'
import type { Workspace } from './workspace'

const KEEP_POS = ['XNAME', 'XTAG', 'XPW', 'XPN', 'XPB', 'XDIFF', 'XEV', 'XST', 'XSB', 'XSW']
const KEEP_MOVE = ['XCAT', 'XMW', 'XMN', 'XSTY', 'XPUR']

/** The position on the board (as set-up stones) and every database move after it, as an SGF game. */
export function toSgf(ctx: Ctx, step: Step, maxNodes = 2000): string {
  const board = displayBoard(ctx, step)
  const root: Record<string, string[]> = { FF: ['4'], CA: ['UTF-8'], GM: ['1'], SZ: ['19'], AP: ['Baduk Notebook'] }
  const ab: string[] = [], aw: string[] = []
  board.forEach((row, y) => row.forEach((s, x) => s && (s === 1 ? ab : aw).push(sgfPoint([x, y]))))
  if (ab.length) root.AB = ab
  if (aw.length) root.AW = aw
  root.PL = [toMove(ctx, step) === -1 ? 'W' : 'B']
  const pf = positionFields(ctx, step)
  for (const k of KEEP_POS) {
    const v = pf.one(k)?.value
    if (v) root[k] = [v]
  }
  const top = newNode(root, null)
  let count = 0
  const seen = new Set<string>([step.key])
  const walk = (parent: Step, node: SgfNode) => {
    for (const c of candidates(ctx, parent)) {
      if (count++ > maxNodes || seen.has(c.step.key)) continue
      seen.add(c.step.key)
      const d: Record<string, string[]> = { [c.sign === 1 ? 'B' : 'W']: [c.pt ? sgfPoint(c.pt) : ''] }
      const mf = moveFields(ctx, parent, c.edge)
      for (const k of KEEP_MOVE) {
        const v = mf.one(k)?.value
        if (v) d[k] = [v]
      }
      const why = mf.one('XMW')?.value
      if (why) d.C = [playerWords(why, frame(ctx, parent).swap, c.edge.sign).replace(/\{\{[A-Z]+:[^|}]*\|([^}]*)\}\}/g, '$1').replace(/\{\{[A-Z]+:([^}]*)\}\}/g, '$1')]
      walk(c.step, newNode(d, node))
    }
  }
  walk(step, top)
  return writeSgf([top])
}

/** Loads every line of an SGF file into the target database. Returns the number of moves read. */
export function importSgf(ws: Workspace, ctxOf: () => Ctx, text: string, target: string): number {
  const roots = sgf.parse(text)
  let moves = 0
  for (const root of roots) {
    const B: Pt[] = [], W: Pt[] = []
    for (const v of root.data.AB ?? []) B.push(...parseSgfPtList(v))
    for (const v of root.data.AW ?? []) W.push(...parseSgfPtList(v))
    let first: Sign = root.data.PL?.[0] === 'W' ? -1 : 1
    if (!root.data.PL) {
      const c = root.children[0]
      if (c?.data.W && !c.data.B) first = -1
    }
    const ctx = ctxOf()
    const start = B.length || W.length ? startStep(ctx, { kind: 'setup', B, W, toMove: first }) : startStep(ctx, { kind: 'empty' })
    // Positions created by earlier nodes must be found again: rebuild the graph before each write.
    const fresh = (): Ctx => ({ ...ctx, graph: buildGraph(ws.files) })
    const write = (path: Step[], data: Record<string, string[]>) => {
      const vals: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(data)) if (KEEP_POS.includes(k) || KEEP_MOVE.includes(k)) vals[k] = v
      if (data.C) vals[path.length > 1 ? 'XMN' : 'XPN'] = data.C
      const loc = locate(ws, fresh(), path, target, null, true)
      if (loc && Object.keys(vals).length) setProps(ws, loc, vals)
    }
    const walk = (node: SgfNode, path: Step[]) => {
      let p = path
      const d = node.data
      for (const [prop, sign] of [['B', 1], ['W', -1]] as const)
        if (d[prop]) {
          const pt = parseSgfPt(d[prop][0] ?? '')
          try {
            // Wrong color to move: insert a tenuki first, as the model requires.
            const last = p[p.length - 1]
            if (toMove(ctx, last) !== sign) p = [...p, playFree(ctx, last, -sign as Sign, null)]
            p = [...p, playFree(ctx, p[p.length - 1], sign, pt)]
            moves++
          } catch {
            return
          }
        }
      if (node !== root || Object.keys(d).some((k) => !MOVE_PROPS.has(k))) write(p, d)
      if (!node.children.length && p.length > 1) locate(ws, fresh(), p, target, null, true)
      for (const c of node.children) walk(c, p)
    }
    walk(root, [start])
  }
  return moves
}
