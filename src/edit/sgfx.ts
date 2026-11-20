/**
 * SGF compatibility (docs/MODEL.md §10): download a position and what follows it as SGF, and load an
 * SGF file into a database (each node becomes a position, each move a move; SGF comments become comments).
 * Tags travel in an `XT` property, one `key=value` (JSON value) per tag, so a download loads back as it was.
 */
import * as sgf from '@sabaki/sgf'
import type { SgfNode } from '@sabaki/sgf'
import { parseSgfPt, parseSgfPtList, type Pt, type Sign } from '../core/geometry'
import type { TagValue } from '../core/tags'
import { playerWords } from '../core/refs'
import { candidates, displayBoard, frame, moveFields, node as nodeOf, playFree, positionFields, startStep, toMove, type Ctx, type Step } from '../view'
import { newNode, sgfPoint, writeSgf } from './sgfio'
import { locate, setComments, setTags, type On } from './ops'
import { buildGraph } from '../core/graph'
import type { Workspace } from './workspace'

/** Text of a comment for other SGF programs: player words and references become plain words. */
const plain = (t: string, swap: boolean, player: Sign) =>
  playerWords(t, swap, player).replace(/\{\{[A-Z]+:[^|}]*\|([^}]*)\}\}/g, '$1').replace(/\{\{[A-Z]+:([^}]*)\}\}/g, '$1')

const tagProp = (keys: string[], get: (k: string) => TagValue | undefined) =>
  keys.flatMap((k) => {
    const v = get(k)
    return v === undefined ? [] : [`${k}=${JSON.stringify(v)}`]
  })

/** Tags from an `XT` property, and from the older single properties of earlier SGF files. */
function readTags(d: Record<string, string[]>): Record<string, TagValue> {
  const out: Record<string, TagValue> = {}
  for (const v of d.XT ?? []) {
    const i = v.indexOf('=')
    if (i < 1) continue
    try {
      out[v.slice(0, i)] = JSON.parse(v.slice(i + 1)) as TagValue
    } catch {
      out[v.slice(0, i)] = v.slice(i + 1)
    }
  }
  const OLD: Record<string, string> = { XNAME: 'name', XTAG: 'topics', XDIFF: 'difficulty', XST: 'status', XSB: 'black-first', XSW: 'white-first', XCAT: 'kind', XSTY: 'intention', XPUR: 'purpose' }
  for (const [p, k] of Object.entries(OLD)) if (d[p]?.length && !(k in out)) out[k] = ['name', 'topics', 'intention', 'purpose'].includes(k) ? d[p] : d[p][0]
  if (d.XEV?.length && !('evaluation' in out) && Number.isFinite(Number(d.XEV[0]))) out.evaluation = Number(d.XEV[0])
  return out
}

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
  const F = frame(ctx, step)
  const xt = tagProp(pf.keys().filter((k) => k !== 'board'), (k) => pf.get(k)?.value)
  if (xt.length) root.XT = xt
  const name = pf.text('name')
  if (name) root.GN = [name]
  const own = nodeOf(ctx, step).contribs.filter((c) => ctx.active.has(c.db)).flatMap((c) => c.rec.comments)
  if (own.length) root.C = [own.map((t) => plain(t, F.swap, nodeOf(ctx, step).toMove)).join('\n\n')]
  const top = newNode(root, null)
  let count = 0
  const seen = new Set<string>([step.key])
  const walk = (parent: Step, node: SgfNode) => {
    for (const c of candidates(ctx, parent)) {
      if (count++ > maxNodes || seen.has(c.step.key)) continue
      seen.add(c.step.key)
      const d: Record<string, string[]> = { [c.sign === 1 ? 'B' : 'W']: [c.pt ? sgfPoint(c.pt) : ''] }
      const mf = moveFields(ctx, parent, c.edge)
      const mx = tagProp(mf.keys().filter((k) => k !== 'board'), (k) => mf.get(k)?.value)
      if (mx.length) d.XT = mx
      const swap = frame(ctx, parent).swap
      const texts = c.edge.contribs.filter((x) => ctx.active.has(x.db)).flatMap((x) => x.rec.comments)
      if (texts.length) d.C = [texts.map((t) => plain(t, swap, c.edge.sign)).join('\n\n')]
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
      // A node with a move describes the move; the first node describes the position.
      const on: On = path.length > 1 ? 'move' : 'pos'
      const tags = readTags(data)
      const comments = [...(data.C ?? []), ...(data.XMW ?? []), ...(data.XPW ?? [])].filter((t) => t.trim())
      if (!Object.keys(tags).length && !comments.length) return
      const loc = locate(ws, fresh(), path, target, null, true)
      if (!loc) return
      if (Object.keys(tags).length) setTags(ws, loc, on, tags)
      if (comments.length) setComments(ws, loc, on, comments)
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
      if (node !== root || d.C || d.XT || d.GN) write(p, node === root && d.GN && !d.XT ? { ...d, XNAME: d.GN } : d)
      if (!node.children.length && p.length > 1) locate(ws, fresh(), p, target, null, true)
      for (const c of node.children) walk(c, p)
    }
    walk(root, [start])
  }
  return moves
}
