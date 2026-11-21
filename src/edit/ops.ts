/** Edit operations on the workspace (docs/MODEL.md): positions with ids, and moves from one id to another. */
import GoBoard from '@sabaki/go-board'
import { apply, applySign, inverse, transformMap, type Pt, type Sign, type SignMap, type Transform } from '../core/geometry'
import { canonical } from '../core/hash'
import { asText, type TagValue } from '../core/tags'
import type { Graph } from '../core/graph'
import { boardOf, colorOf, isStartId, moveText, nOf, nextId, seqOf, signOf, stonesOf, type PosRec, type MoveRec, type Free, type Rec } from '../core/model'
import { displayBoard, frame, node as nodeOf, type Ctx, type Step } from '../view'
import type { DatabaseInfo } from '../data/load'
import type { WorkFile, Workspace } from './workspace'

export interface Location {
  file: WorkFile
  pos: PosRec
  /** The move into this position in the same database (null at the start of the line). */
  move: MoveRec | null
  /** Maps the position's stored frame to the canonical frame. */
  T: Transform
}

/** Which record of a location a write goes to: the position, or the move into it. */
export type On = 'pos' | 'move'

const fileOfPos = (ws: Workspace, db: string, pos: PosRec) => ws.files.find((f) => f.db === db && f.positions.includes(pos))!

export function touch(ws: Workspace, f: WorkFile) {
  ws.dirty.add(f.path)
  ws.version++
}

/** All ids of a database. */
const idsOf = (ws: Workspace, db: string) => new Set(ws.files.filter((f) => f.db === db).flatMap((f) => f.positions.map((p) => p.id)))
const findPos = (ws: Workspace, db: string, id: string) => {
  for (const f of ws.files) if (f.db === db) for (const p of f.positions) if (p.id === id) return { file: f, pos: p }
  return null
}

/** The target database's record of a step's position, if any. */
function recOf(ctx: Ctx, step: Step, db: string) {
  const c = ctx.graph.nodes.get(step.key)?.contribs.find((c) => c.db === db)
  return c ? { pos: c.pos, T: c.toCanon } : null
}

/** N of a position: from the graph, or one more than the previous one. */
const depthOf = (g: Graph, key: string, prev?: PosRec) => g.depth.get(key) ?? (prev ? nOf(prev.id) + 1 : 0)

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lines'

/** Adds a move from `prev` (stored frame point) to a position in the same database, creating it if needed. */
function link(ws: Workspace, ctx: Ctx, db: string, prev: { file: WorkFile; pos: PosRec }, pt: Pt | null): { pos: PosRec; move: MoveRec; T: Transform; key: string } {
  const sign = signOf(prev.pos.toPlay)
  const before = boardOf(prev.pos.stones)
  const after: SignMap = pt ? (new GoBoard(before).makeMove(sign, pt).signMap as SignMap) : before
  const { key } = canonical(after, -sign as Sign)
  const text = moveText(pt)
  let move = prev.pos.moves.find((m) => m.move === text)
  let child = move ? findPos(ws, db, move.to) : null
  if (!child) {
    // Is the position already in this database (a transposition)?
    const known = ctx.graph.nodes.get(key)?.contribs.find((c) => c.db === db)
    if (known) child = { file: fileOfPos(ws, db, known.pos), pos: known.pos }
  }
  if (!child) {
    const others = ctx.graph.nodes.get(key)?.contribs.map((c) => c.pos.id) ?? []
    const taken = idsOf(ws, db)
    const reuse = others.find((id) => !taken.has(id))
    const id = reuse ?? nextId(seqOf(prev.pos.id), depthOf(ctx.graph, key, prev.pos) || nOf(prev.pos.id) + 1, (x) => taken.has(x) || x === seqOf(prev.pos.id))
    const pos: PosRec = { id, stones: stonesOf(after), toPlay: colorOf(-sign as Sign), free: prev.pos.free, comments: [], tags: {}, moves: [] }
    prev.file.positions.push(pos)
    child = { file: prev.file, pos }
  }
  if (!move) prev.pos.moves.push((move = { move: text, to: child.pos.id, comments: [], tags: {} }))
  else move.to = child.pos.id
  touch(ws, prev.file)
  if (child.file !== prev.file) touch(ws, child.file)
  // The child's own stored frame (it may already exist, stored in another orientation).
  const T = canonical(boardOf(child.pos.stones), signOf(child.pos.toPlay)).toCanon
  return { pos: child.pos, move, T, key }
}

/**
 * The target database's record for the last position of `path` and the move into it.
 * With `create`, missing positions and moves are added (and, if needed, a new file).
 */
export function locate(ws: Workspace, ctx: Ctx, path: Step[], target: string, entryId: string | null, create: boolean): Location | null {
  const last = path[path.length - 1]
  const here = recOf(ctx, last, target)
  const moveHere = (path.length > 1 && last.edge?.contribs.find((c) => c.db === target)?.move) || null
  if (here && (moveHere || path.length === 1)) {
    const file = fileOfPos(ws, target, here.pos)
    return { file, pos: here.pos, move: moveHere, T: here.T }
  }
  if (!create) return here ? { file: fileOfPos(ws, target, here.pos), pos: here.pos, move: null, T: here.T } : null

  // The last position before the end that is in the target database; the line is added from there.
  let i = path.length - 2
  while (i >= 0 && !recOf(ctx, path[i], target)) i--
  let cur: { file: WorkFile; pos: PosRec; T: Transform; key: string }
  if (i >= 0) {
    const r = recOf(ctx, path[i], target)!
    cur = { file: fileOfPos(ws, target, r.pos), pos: r.pos, T: r.T, key: path[i].key }
  } else {
    // Nothing of this line is in the target database yet: start a new file at the line's first position.
    i = 0
    const first = path[0]
    const n = nodeOf(ctx, first)
    const stored = transformMap(first.D, n.board)
    const others = n.contribs.map((c) => c.pos.id)
    const taken = idsOf(ws, target)
    const seq = entryId ?? (others[0] ? seqOf(others[0]) : 'joseki')
    const id = others.find((x) => !taken.has(x)) ?? (taken.has(seq) ? nextId(seq, depthOf(ctx.graph, first.key), (x) => taken.has(x)) : seq)
    const pos: PosRec = { id, stones: stonesOf(stored), toPlay: colorOf(applySign(first.D, n.toMove) || 1), free: n.contribs[0]?.pos.free ?? 'corner', comments: [], tags: {}, moves: [] }
    let name = `${target}/${seq.startsWith('joseki') ? 'joseki' : 'shapes'}/${slugify(seqOf(id).split('/').slice(1).join(' ') || 'lines')}.json`
    for (let k = 2; ws.files.some((f) => f.path === name); k++) name = name.replace(/(-\d+)?\.json$/, `-${k}.json`)
    const file: WorkFile = { db: target, path: name, positions: [pos], loose: [], original: null }
    ws.files.push(file)
    touch(ws, file)
    cur = { file, pos, T: inverse(first.D), key: first.key }
  }
  let move: MoveRec | null = null
  for (let j = i + 1; j < path.length; j++) {
    const e = path[j].edge ?? path[j].free!
    const pt = e.pt ? apply(inverse(cur.T), e.pt) : null
    const r = link(ws, ctx, target, cur, pt)
    const f = findPos(ws, target, r.pos.id)!.file
    cur = { file: f, pos: r.pos, T: r.T, key: r.key }
    move = r.move
  }
  return { file: cur.file, pos: cur.pos, move, T: cur.T }
}

/** The record a write goes to (null: the start of a line has no move). */
export const recAt = (loc: Location, on: On): Rec | null => (on === 'move' ? loc.move : loc.pos)

/** Sets or removes tags (`null`, "" or an empty list removes the key). */
export function setTags(ws: Workspace, loc: Location, on: On, values: Record<string, TagValue | null>) {
  const r = recAt(loc, on)
  if (!r) return
  for (const [k, v] of Object.entries(values)) {
    if (v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) delete r.tags[k]
    else r.tags[k] = v
  }
  touch(ws, loc.file)
}

/** Replaces the comments (empty ones are dropped). */
export function setComments(ws: Workspace, loc: Location, on: On, list: string[]) {
  const r = recAt(loc, on)
  if (!r) return
  r.comments = list.map((x) => x.trim()).filter(Boolean)
  touch(ws, loc.file)
}

/** Renames a key on a record, keeping its value and its place. */
export function renameTag(ws: Workspace, loc: Location, on: On, from: string, to: string) {
  const r = recAt(loc, on)
  if (!r || !(from in r.tags) || !to || to === from) return
  r.tags = Object.fromEntries(Object.entries(r.tags).map(([k, v]) => [k === from ? to : k, v]))
  touch(ws, loc.file)
}

export type MoveCheck = { ok: true; joins: boolean } | { ok: false; reason: string }

/** Checks a move in display coordinates: occupied point, suicide, ko, loops. Also says whether the result is already known. */
export function checkMove(ctx: Ctx, path: Step[], sign: Sign, pt: Pt | null): MoveCheck {
  const step = path[path.length - 1]
  if (!pt) {
    const last = step.edge ?? step.free
    if (path.length > 1 && last && !last.pt) return { ok: false, reason: 'Two tenukis in a row are not allowed.' }
    return { ok: true, joins: false }
  }
  const board = new GoBoard(displayBoard(ctx, step))
  let next: GoBoard
  try {
    next = board.makeMove(sign, pt, { preventOverwrite: true, preventSuicide: true })
  } catch {
    return { ok: false, reason: board.get(pt) ? 'That point is occupied.' : 'That move would be suicide.' }
  }
  const key = canonical(next.signMap as never, (-sign) as Sign).key
  if (path.some((s) => s.key === key)) return { ok: false, reason: path.length >= 2 && path[path.length - 2].key === key ? 'Ko: retake elsewhere first.' : 'This returns to a position already on the line.' }
  return { ok: true, joins: ctx.graph.nodes.has(key) }
}

/** Adds a move (display coordinates; null = tenuki) after the current position. */
export function addMove(ws: Workspace, ctx: Ctx, path: Step[], target: string, entryId: string | null, sign: Sign, pt: Pt | null) {
  const toCanon = inverse(frame(ctx, path[path.length - 1]))
  const loc = locate(ws, ctx, path, target, entryId, true)!
  const canonPt = pt ? apply(toCanon, pt) : null
  const canonSign = applySign(toCanon, sign)
  link(ws, ctx, target, { file: loc.file, pos: loc.pos }, canonPt ? apply(inverse(loc.T), canonPt) : null)
  return { canonPt, canonSign }
}

/**
 * Removes the target database's copy of the last move of `path`, and the positions that only that
 * move led to (start positions of a sequence are kept).
 */
export function deleteMove(ws: Workspace, path: Step[], target: string): boolean {
  const e = path[path.length - 1].edge
  if (!e) return false
  let removed = false
  for (const c of e.contribs.filter((c) => c.db === target && c.move)) {
    c.pos.moves = c.pos.moves.filter((m) => m !== c.move)
    touch(ws, fileOfPos(ws, target, c.pos))
    removed = true
    collect(ws, target, c.move!.to)
  }
  return removed
}

/** Deletes positions below `fromId` that no move of the database reaches any more. */
function collect(ws: Workspace, db: string, fromId: string) {
  const files = ws.files.filter((f) => f.db === db)
  const all = files.flatMap((f) => f.positions)
  const byId = new Map(all.map((p) => [p.id, p]))
  const dead = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    const below = new Set<string>([fromId])
    for (const id of below) for (const m of byId.get(id)?.moves ?? []) below.add(m.to)
    for (const id of below) {
      if (dead.has(id) || isStartId(id)) continue
      const into = all.filter((p) => !dead.has(p.id) && p.moves.some((m) => m.to === id))
      if (!into.length) {
        dead.add(id)
        changed = true
      }
    }
  }
  for (const f of files) {
    const before = f.positions.length
    f.positions = f.positions.filter((p) => !dead.has(p.id))
    if (f.positions.length !== before) touch(ws, f)
  }
}

/** Makes the last move of `path` the first move listed from its position in the target database. */
export function promote(ws: Workspace, path: Step[], target: string): boolean {
  const e = path[path.length - 1].edge
  if (!e) return false
  let done = false
  for (const c of e.contribs.filter((c) => c.db === target && c.move)) {
    if (c.pos.moves[0] === c.move) continue
    c.pos.moves = [c.move!, ...c.pos.moves.filter((m) => m !== c.move)]
    touch(ws, fileOfPos(ws, target, c.pos))
    done = true
  }
  return done
}

/**
 * Starts a sequence at the last position of `path`: the position gets the id `seq`, and the positions
 * after it that were in the same sequence move to the new one (docs/MODEL.md §4).
 */
export function nameSequence(ws: Workspace, ctx: Ctx, path: Step[], target: string, seq: string, name: string | null): string | null {
  seq = seq.split('/').map((s) => s.trim()).filter(Boolean).join('/')
  if (!seq || seq.includes(':')) return 'A sequence id cannot be empty or contain ":".'
  const loc = locate(ws, ctx, path, target, null, true)!
  const old = loc.pos.id
  if (old !== seq) {
    if (findPos(ws, target, seq)) return `"${seq}" already exists in ${target}.`
    const oldSeq = seqOf(old)
    const taken = idsOf(ws, target)
    const rename = new Map<string, string>([[old, seq]])
    taken.add(seq)
    const queue = [loc.pos]
    for (const p of queue)
      for (const m of p.moves) {
        if (rename.has(m.to) || seqOf(m.to) !== oldSeq || isStartId(m.to)) continue
        const next = nextId(seq, nOf(m.to), (x) => taken.has(x))
        taken.add(next)
        rename.set(m.to, next)
        const r = findPos(ws, target, m.to)
        if (r) queue.push(r.pos)
      }
    for (const f of ws.files.filter((f) => f.db === target)) {
      let hit = false
      for (const p of f.positions) {
        if (rename.has(p.id)) {
          p.id = rename.get(p.id)!
          hit = true
        }
        for (const m of p.moves)
          if (rename.has(m.to)) {
            m.to = rename.get(m.to)!
            hit = true
          }
      }
      if (hit) touch(ws, f)
    }
  }
  if (name !== null) {
    const others = (Array.isArray(loc.pos.tags.name) ? loc.pos.tags.name : []).slice(1)
    setTags(ws, loc, 'pos', { name: name ? [name, ...others] : others.length ? others : null })
  }
  touch(ws, loc.file)
  return null
}

export interface NewEntry {
  /** Sequence id, e.g. "joseki/4-4 point/my variation". */
  id: string
  name: string
  difficulty: string
  stones: { B: Pt[]; W: Pt[] }
  toMove: Sign
  free: Free
}

export function createEntry(ws: Workspace, target: string, e: NewEntry): string | null {
  const seq = e.id.split('/').map((s) => s.trim()).filter(Boolean).join('/')
  if (!seq || seq.includes(':')) return 'Write a sequence id such as joseki/4-4 point/my line.'
  if (findPos(ws, target, seq)) return 'This sequence already exists in this database.'
  const board: SignMap = boardOf('')
  for (const [x, y] of e.stones.B) board[y][x] = 1
  for (const [x, y] of e.stones.W) board[y][x] = -1
  const tags: Record<string, TagValue> = { name: [e.name] }
  if (e.difficulty) tags.difficulty = e.difficulty
  let path = `${target}/${seq.startsWith('joseki') ? 'joseki' : 'shapes'}/${slugify(seq.split('/').slice(1).join(' ') || seq)}.json`
  for (let k = 2; ws.files.some((f) => f.path === path); k++) path = path.replace(/(-\d+)?\.json$/, `-${k}.json`)
  ws.files.push({ db: target, path, positions: [{ id: seq, stones: stonesOf(board), toPlay: colorOf(e.toMove || 1), free: e.free, comments: [], tags, moves: [] }], loose: [], original: null })
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

/** Which sequence and move a canonical position belongs to (for "joins an existing position"). */
export function describePosition(g: Graph, key: string): string | null {
  const c = g.nodes.get(key)?.contribs[0]
  if (!c) return null
  const seq = seqOf(c.pos.id)
  const name = asText(g.entries.get(seq)?.contribs[0]?.rec.tags.name) || seq.split('/').pop()
  return isStartId(c.pos.id) ? `${name}` : `${name}, move ${nOf(c.pos.id)}`
}
