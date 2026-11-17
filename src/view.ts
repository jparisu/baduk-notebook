/** View model: turns the canonical graph into what the screen shows, after transforms and database filters. */
import type { Graph, Contribution, Edge, PosNode } from './core/graph'
import { edgeCategory, labelsAt, visibleEdges } from './core/graph'
import { CATEGORY_ORDER, COLOR_PROPS, LIST_PROPS, TEXT_PROPS, flipValue, type Category } from './core/fields'
import GoBoard from '@sabaki/go-board'
import { isStartId } from './core/model'
import { canonical } from './core/hash'
import { apply, applySign, compose, inverse, parseSgfPtList, transformMap, type Pt, type Sign, type SignMap, type Transform } from './core/geometry'
import { parseText, playerWords, propMarks, transformMarks, type Mark, type Segment } from './core/refs'

/**
 * One step of the current line. `D` maps the node's canonical frame to the entry's stored frame.
 * A step reached by a database move has `edge`; a move played freely (SPEC §8.3 free play) has `free`.
 * A free position that is not in any database also carries its own canonical board.
 */
export interface Step {
  key: string
  D: Transform
  edge?: Edge
  free?: { sign: Sign; pt: Pt | null } // in the parent's canonical frame
  board?: SignMap
  toMove?: Sign
}

/** The move that led to a step, in the parent's canonical frame. */
export const moveOf = (s: Step): { sign: Sign; pt: Pt | null } | null => s.free ?? s.edge ?? null

/** True when the position is in an active database. */
export const inBook = (ctx: Ctx, s: Step) => ctx.graph.nodes.has(s.key)

export interface Ctx {
  graph: Graph
  active: Set<string>
  order: string[] // database order from index.json (later wins)
  U: Transform // user display transform
}

export const frame = (ctx: Ctx, step: Step) => compose(ctx.U, step.D)
export const node = (ctx: Ctx, step: Step): PosNode =>
  ctx.graph.nodes.get(step.key) ?? { key: step.key, board: step.board!, toMove: step.toMove ?? 0, contribs: [], edges: [], parents: [] }

/**
 * Plays a move freely after `parent` (canonical frame of the parent). If the result is a known position
 * reached by a database move, that move's step is returned, so the line is back "in the book".
 */
export function freeStep(ctx: Ctx, parent: Step, sign: Sign, pt: Pt | null): Step {
  const known = visibleEdges(ctx.graph, parent.key, ctx.active).find(
    (e) => e.sign === sign && (pt ? e.pt && e.pt[0] === pt[0] && e.pt[1] === pt[1] : !e.pt),
  )
  if (known) return childStep(parent, known)
  let b = new GoBoard(node(ctx, parent).board)
  if (pt) b = b.makeMove(sign, pt)
  const after = b.signMap as SignMap
  const { key, toCanon } = canonical(after, (-sign) as Sign)
  const D = compose(parent.D, inverse(toCanon))
  const free = { sign, pt }
  // The same database move played in a symmetric orientation (e.g. R14 instead of O17 on a lone 4-4 stone).
  const twin = visibleEdges(ctx.graph, parent.key, ctx.active).find((e) => e.child === key)
  if (twin) return { key, D, edge: twin, free }
  if (ctx.graph.nodes.has(key)) return { key, D, free }
  return { key, D, free, board: transformMap(toCanon, after), toMove: applySign(toCanon, (-sign) as Sign) }
}

/** Same as freeStep, with the move given in display coordinates and colors. */
export function playFree(ctx: Ctx, parent: Step, sign: Sign, pt: Pt | null): Step {
  const toCanon = inverse(frame(ctx, parent))
  return freeStep(ctx, parent, applySign(toCanon, sign), pt ? apply(toCanon, pt) : null)
}

/** Rebuilds a line on a (new) graph or new active databases, keeping freely played moves. */
export function rebaseLine(ctx: Ctx, entryId: string, old: Step[]): Step[] {
  if (!ctx.graph.entries.has(entryId)) return []
  const out = [rootStep(ctx, entryId)]
  for (const s of old.slice(1)) {
    const parent = out[out.length - 1]
    const c = candidates(ctx, parent).find((c) => c.step.key === s.key)
    if (c) {
      out.push(c.step)
      continue
    }
    const m = moveOf(s)
    if (!m) break
    // The parent's canonical frame only depends on its position, so the stored move still applies.
    try {
      out.push(freeStep(ctx, parent, m.sign, m.pt))
    } catch {
      break
    }
  }
  return out
}

export function rootStep(ctx: Ctx, entryId: string): Step {
  const e = ctx.graph.entries.get(entryId)!
  return { key: e.root, D: inverse(e.contribs[0].toCanon) }
}

export function childStep(parent: Step, edge: Edge): Step {
  return { key: edge.child, D: compose(parent.D, inverse(edge.rel)), edge }
}

export function displayBoard(ctx: Ctx, step: Step): SignMap {
  return transformMap(frame(ctx, step), node(ctx, step).board)
}

export const toMove = (ctx: Ctx, step: Step): Sign => applySign(frame(ctx, step), node(ctx, step).toMove)

export interface Candidate {
  edge: Edge
  step: Step
  cat: Category | null
  pt: Pt | null // display frame
  sign: Sign // display colors
  label: string
  dbs: string[]
}

export function candidates(ctx: Ctx, step: Step): Candidate[] {
  const F = frame(ctx, step)
  const list = visibleEdges(ctx.graph, step.key, ctx.active).map((edge) => {
    const cat = edgeCategory(edge, ctx.active, ctx.order)
    const why = edge.contribs.find((c) => ctx.active.has(c.db) && c.props.XMW)?.props.XMW?.[0] ?? ''
    return {
      edge,
      step: childStep(step, edge),
      cat,
      pt: edge.pt ? apply(F, edge.pt) : null,
      sign: applySign(F, edge.sign),
      label: shortLabel(playerWords(why, F.swap, edge.sign)),
      dbs: [...new Set(edge.contribs.filter((c) => ctx.active.has(c.db)).map((c) => c.db))],
    }
  })
  const rank = (c: Candidate) => (c.cat ? CATEGORY_ORDER.indexOf(c.cat) : 99)
  return list.sort((a, b) => rank(a) - rank(b))
}

/** First sentence of a "why" text, without references markup. */
function shortLabel(text: string) {
  const plain = text.replace(/\{\{[^|}]*\|([^}]*)\}\}/g, '$1').replace(/\{\{([A-Z]+):([^}]*)\}\}/g, '$2')
  const first = plain.split(/(?<=\.)\s/)[0]
  return first.length > 60 ? first.slice(0, 57) + '…' : first
}

/* ---- Field resolution (SPEC §3.3) ---- */

export interface TextValue {
  db: string
  segments: Segment[]
}
export interface Resolved {
  value: string
  db: string
  overridden: { db: string; value: string }[]
}

/** Transform from a contribution's file frame to the display frame. */
const fileToDisplay = (F: Transform, c: Contribution) => compose(F, c.toCanon)

export class Fields {
  constructor(
    protected ctx: Ctx,
    private contribs: Contribution[],
    private F: Transform,
    private idPrefix: string,
    /** Who "{{Player}}" is in these texts, in canonical colors (the mover, or the player to move). */
    private player: Sign | null = null,
  ) {}

  private visible() {
    return this.contribs
      .filter((c) => this.ctx.active.has(c.db))
      .sort((a, b) => this.ctx.order.indexOf(a.db) - this.ctx.order.indexOf(b.db))
  }

  /** True when this contribution's colors are swapped relative to the display. */
  swapped(c: Contribution) {
    return fileToDisplay(this.F, c).swap
  }

  text(prop: string): TextValue[] {
    return this.visible().flatMap((c, i) =>
      (c.props[prop] ?? []).map((t, j) => ({ db: c.db, segments: parseText(t, fileToDisplay(this.F, c), `${this.idPrefix}:${prop}:${i}:${j}`, this.player) })),
    )
  }

  /** Single value: the database listed last wins. Color-dependent values are flipped when needed. */
  one(prop: string): Resolved | null {
    const vals = this.visible().flatMap((c) => {
      const v = c.props[prop]?.[0]
      if (v === undefined || v === '') return []
      return [{ db: c.db, value: COLOR_PROPS.has(prop) && this.swapped(c) ? flipValue(prop, v) : v }]
    })
    if (!vals.length) return null
    const last = vals[vals.length - 1]
    return { ...last, overridden: vals.slice(0, -1).filter((v) => v.value !== last.value) }
  }

  list(prop: string): string[] {
    return [...new Set(this.visible().flatMap((c) => c.props[prop] ?? []))]
  }

  /** Board markup and overlays stored on the node (always visible). */
  marks(): Mark[] {
    return this.visible().flatMap((c) => transformMarks(fileToDisplay(this.F, c), propMarks(c.props)))
  }

  /** SGF point list values (e.g. XVITAL) in the display frame. */
  points(prop: string): Pt[] {
    return this.visible().flatMap((c) => (c.props[prop] ?? []).flatMap(parseSgfPtList).map((p) => apply(fileToDisplay(this.F, c), p)))
  }

  /** The first visible contribution with this property, for swap checks (e.g. XRESB/XRESW). */
  firstWith(prop: string): Contribution | undefined {
    return this.visible().find((c) => c.props[prop])
  }
}

export function isText(prop: string) {
  return TEXT_PROPS.has(prop)
}
export function isList(prop: string) {
  return LIST_PROPS.has(prop)
}

/**
 * Position fields that a position inherits from the earlier positions of the line until it sets its own
 * value (docs/MODEL.md §1). Inheritance stops at the start of a sequence. Names, the joseki-end status,
 * board marks and every move field are never inherited.
 */
export const INHERITED = new Set(['XPB', 'XPBS', 'XEV', 'XSEN', 'XPW', 'XRES', 'XTEN', 'XAJI', 'XPN', 'XTAG', 'XDIFF', 'XSB', 'XSW', 'XEYE', 'XLIB'])

const startsSequence = (ctx: Ctx, step: Step) => node(ctx, step).contribs.some((c) => ctx.active.has(c.db) && isStartId(c.pos.id))

/** Fields of the last position of `path`, with inherited values. */
export class LineFields extends Fields {
  constructor(ctx: Ctx, private path: Step[]) {
    const s = path[path.length - 1]
    super(ctx, node(ctx, s).contribs, frame(ctx, s), `p:${s.key}`, node(ctx, s).toMove)
  }
  /** Index in the line of the position the value comes from (the last one when it is its own), or null. */
  source(prop: string): number | null {
    const last = this.path.length - 1
    for (let i = last; i >= 0; i--) {
      const own = positionFields(this.ctx, this.path[i])
      if (own.one(prop) || own.list(prop).length) return i
      if (!INHERITED.has(prop) || startsSequence(this.ctx, this.path[i])) return null
    }
    return null
  }
  private at(prop: string): Fields | null {
    const i = this.source(prop)
    return i === null ? null : i === this.path.length - 1 ? null : positionFields(this.ctx, this.path[i])
  }
  one(prop: string) {
    const f = this.at(prop)
    return f ? f.one(prop) : super.one(prop)
  }
  text(prop: string) {
    const f = this.at(prop)
    return f ? f.text(prop) : super.text(prop)
  }
  list(prop: string) {
    const f = this.at(prop)
    return f ? f.list(prop) : super.list(prop)
  }
}
export const lineFields = (ctx: Ctx, path: Step[]) => new LineFields(ctx, path)

export const positionFields = (ctx: Ctx, step: Step) => new Fields(ctx, node(ctx, step).contribs, frame(ctx, step), `p:${step.key}`, node(ctx, step).toMove)
export function moveFields(ctx: Ctx, parent: Step, edge: Edge) {
  return new Fields(ctx, edge.contribs, frame(ctx, parent), `m:${edge.child}`, edge.sign)
}
export const entryFields = (ctx: Ctx, entryId: string, rootStep: Step) =>
  new Fields(ctx, ctx.graph.entries.get(entryId)!.contribs, frame(ctx, rootStep), `e:${entryId}`, node(ctx, rootStep).toMove)

/* ---- Position-first navigation (SPEC §8.0) ---- */

/** Where a line starts: the empty corner, the first node of a label, or stones set up by hand. */
export type Start =
  | { kind: 'empty' }
  | { kind: 'label'; id: string }
  | { kind: 'setup'; B: Pt[]; W: Pt[]; toMove: Sign }

export type Move = { sign: Sign; pt: Pt | null }

export function startStep(ctx: Ctx, start: Start): Step {
  if (start.kind === 'label' && ctx.graph.entries.has(start.id)) return rootStep(ctx, start.id)
  const board: SignMap = Array.from({ length: 19 }, () => Array<Sign>(19).fill(0))
  let toMove: Sign = 1
  if (start.kind === 'setup') {
    for (const [x, y] of start.B) board[y][x] = 1
    for (const [x, y] of start.W) board[y][x] = -1
    toMove = start.toMove
  }
  const { key, toCanon } = canonical(board, toMove)
  const D = inverse(toCanon)
  if (ctx.graph.nodes.has(key)) return { key, D }
  return { key, D, board: transformMap(toCanon, board), toMove: applySign(toCanon, toMove) }
}

/** The moves of a line, each in its parent's canonical frame (stable across rebuilds). */
export const movesOf = (path: Step[]): Move[] =>
  path.slice(1).flatMap((s) => {
    const m = moveOf(s)
    // Only color and point: edges also carry database objects that must not be stored.
    return m ? [{ sign: m.sign, pt: m.pt ? ([m.pt[0], m.pt[1]] as Pt) : null }] : []
  })

/** Replays moves from a start; stops at the first illegal move. */
export function replay(ctx: Ctx, start: Start, moves: Move[]): Step[] {
  const out = [startStep(ctx, start)]
  for (const m of moves) {
    try {
      out.push(freeStep(ctx, out[out.length - 1], m.sign, m.pt))
    } catch {
      break
    }
  }
  return out
}

/**
 * The label to show for the current position: among the labels in force here, the one whose
 * first node appears latest in the line (so "Empty corner" gives way to "3-3 invasion").
 */
export function primaryLabel(ctx: Ctx, path: Step[], prefer?: string | null): string | null {
  const here = labelsAt(ctx.graph, path[path.length - 1].key, ctx.active)
  if (!here.length) return null
  // Where you come from decides between names of the same position: the sequence you opened wins a tie.
  if (prefer && here.includes(prefer)) here.sort((a, b) => Number(b === prefer) - Number(a === prefer))
  let best = here[0], bestIdx = -2
  for (const l of here) {
    const root = ctx.graph.entries.get(l)!.root
    let idx = -1
    for (let i = path.length - 1; i >= 0; i--) if (path[i].key === root) { idx = i; break }
    if (idx > bestIdx) {
      best = l
      bestIdx = idx
    }
  }
  return best
}

/** Index of the label's first node in the line (0 when it starts before the line). */
export function labelStart(ctx: Ctx, path: Step[], label: string): number {
  const root = ctx.graph.entries.get(label)?.root
  for (let i = path.length - 1; i >= 0; i--) if (path[i].key === root) return i
  return 0
}
