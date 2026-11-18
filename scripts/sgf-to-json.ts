/**
 * One-off conversion of the SGF databases to the JSON graph model (docs/MODEL.md §7).
 * Run with: npx vite-node scripts/sgf-to-json.ts
 * Each SGF file becomes a JSON file with the positions first seen in it.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import * as sgf from '@sabaki/sgf'
import type { SgfNode } from '@sabaki/sgf'
import GoBoard from '@sabaki/go-board'
import { canonical } from '../src/core/hash'
import { apply, inverse, parseSgfPt, parseSgfPtList, type Pt, type Sign, type SignMap, type Transform } from '../src/core/geometry'
import { isMoveProp, type Props } from '../src/core/fields'
import { colorOf, moveText, nextId, stonesOf, writeDbFile, type DbFile, type Free, type PosRec } from '../src/core/model'

const ROOT = 'db'
const DROP = new Set(['FF', 'CA', 'GM', 'SZ', 'AB', 'AW', 'AE', 'PL', 'B', 'W', 'XID', 'XFAM', 'XTYPE', 'XSTART', 'XLOC'])

function list(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((n) => {
    const full = join(dir, n)
    return statSync(full).isDirectory() ? list(full) : n.endsWith('.sgf') ? [relative(ROOT, full).split(sep).join('/')] : []
  })
}

interface Pos {
  key: string
  board: SignMap // stored frame (first file it was seen in)
  toCanon: Transform
  toMove: Sign
  data: Props
  label: string | null
  isStart: boolean
  file: string
  moves: { pt: Pt | null; child: string; data: Props }[]
}

const index = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8')) as { databases: { id: string }[] }
const order = index.databases.map((d) => d.id)
const files = list(ROOT).sort((a, b) => order.indexOf(a.split('/')[0]) - order.indexOf(b.split('/')[0]) || a.localeCompare(b))

/** "Bent four · side · enclosed" → "life & death/Bent four/Side, enclosed" (one family per shape). */
function shapeSeq(name: string): string {
  if (name === 'Bent four in the corner') return 'life & death/Bent four/Corner'
  const m = name.match(/^(.+?) · (side|corner|center) · (.+)$/)
  return m ? `life & death/${m[1]}/${m[2][0].toUpperCase()}${m[2].slice(1)}, ${m[3]}` : `life & death/${name}`
}

// Sequence of each label (XID), from its defining node.
const seqOfLabel = new Map<string, string>()
const freeOfLabel = new Map<string, Free>()
const fileOfLabel = new Map<string, string>() // "db|label" → file that names it
for (const path of files) {
  const visit = (n: SgfNode) => {
    const d = n.data
    if (d.XID && d.XNAME) {
      const k = path.split('/')[0] + '|' + d.XID[0]
      if (!fileOfLabel.has(k)) fileOfLabel.set(k, path)
      const shape = d.XTYPE?.[0] === 'shape'
      const fam = d.XFAM?.[0]
      const seq = shape ? shapeSeq(d.XNAME[0]) : !fam || fam === 'Empty corner' ? (fam ? 'joseki' : `joseki/${d.XNAME[0]}`) : `joseki/${fam}`
      if (!seqOfLabel.has(d.XID[0])) seqOfLabel.set(d.XID[0], seq)
      if (shape) freeOfLabel.set(d.XID[0], d.XLOC?.[0] === 'side' ? 'horizontal' : d.XLOC?.[0] === 'center' ? 'anywhere' : 'corner')
    }
    n.children.forEach(visit)
  }
  sgf.parse(readFileSync(join(ROOT, path), 'utf8')).forEach(visit)
}

const perDb = new Map<string, Map<string, Pos>>()
for (const path of files) {
  const db = path.split('/')[0]
  if (!perDb.has(db)) perDb.set(db, new Map())
  const positions = perDb.get(db)!
  const walk = (node: SgfNode, prev: GoBoard, toMove: Sign, parent: Pos | null, parentToCanon: Transform | null, label: string | null) => {
    const d = node.data
    let board = prev
    for (const [prop, sign] of [['AB', 1], ['AW', -1], ['AE', 0]] as const) for (const v of d[prop] ?? []) for (const p of parseSgfPtList(v)) board = board.set(p, sign)
    let move: { sign: Sign; pt: Pt | null } | null = null
    for (const [prop, sign] of [['B', 1], ['W', -1]] as const)
      if (d[prop]) {
        const pt = parseSgfPt(d[prop][0] ?? '')
        if (pt) board = board.makeMove(sign, pt)
        move = { sign, pt }
      }
    if (d.PL) toMove = d.PL[0] === 'W' ? -1 : 1
    const next: Sign = move ? (-move.sign as Sign) : toMove || 1
    const map = board.signMap as SignMap
    const { key, toCanon } = canonical(map, next)
    const starts = !!(d.XID && d.XNAME)
    if (d.XID) label = d.XID[0]
    const moveData: Props = {}, posData: Props = {}
    for (const [k, v] of Object.entries(d)) if (!DROP.has(k)) (isMoveProp(k) ? moveData : posData)[k] = v
    let pos = positions.get(key)
    if (!pos) positions.set(key, (pos = { key, board: map, toCanon, toMove: next, data: {}, label, isStart: starts, file: path, moves: [] }))
    else if (starts && !pos.isStart) Object.assign(pos, { label, isStart: true })
    for (const [k, v] of Object.entries(posData)) if (!pos.data[k]) pos.data[k] = v
    if (parent && move && move.sign !== parent.toMove) {
      // The other color plays first: same stones, the other player to move, joined by a tenuki.
      const flipped = canonical(parent.board, move.sign)
      let alt = positions.get(flipped.key)
      if (!alt) positions.set(flipped.key, (alt = { key: flipped.key, board: parent.board, toCanon: flipped.toCanon, toMove: move.sign, data: {}, label: parent.label, isStart: false, file: parent.file, moves: [] }))
      if (!parent.moves.some((m) => m.child === flipped.key)) parent.moves.push({ pt: null, child: flipped.key, data: {} })
      parentToCanon = canonical(prev.signMap as SignMap, move.sign).toCanon
      parent = alt
    }
    if (parent && move) {
      // Move point in the parent's stored frame.
      const pt = move.pt ? apply(inverse(parent.toCanon), apply(parentToCanon!, move.pt)) : null
      let m = parent.moves.find((x) => x.child === key)
      if (!m) parent.moves.push((m = { pt, child: key, data: {} }))
      for (const [k, v] of Object.entries(moveData)) if (!m.data[k]) m.data[k] = v
    }
    for (const c of node.children) walk(c, board, next, pos, toCanon, label)
  }
  for (const root of sgf.parse(readFileSync(join(ROOT, path), 'utf8'))) walk(root, GoBoard.fromDimensions(19), 0, null, null, null)
}

// N over all databases together.
const depth = new Map<string, number>()
const all = [...perDb.values()].flatMap((m) => [...m.values()])
const hasParent = new Set(all.flatMap((p) => p.moves.map((m) => m.child)))
const queue = [...new Set(all.filter((p) => !hasParent.has(p.key)).map((p) => p.key))]
queue.forEach((k) => depth.set(k, 0))
const byKey = new Map<string, Pos[]>()
for (const p of all) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p])
for (let i = 0; i < queue.length; i++)
  for (const p of byKey.get(queue[i]) ?? [])
    for (const m of p.moves)
      if (!depth.has(m.child)) {
        depth.set(m.child, depth.get(queue[i])! + 1)
        queue.push(m.child)
      }

// Ids: the first database decides; others reuse the same id for the same position.
const idOf = new Map<string, string>()
const used = new Set<string>() // ids of earlier databases, not reused for other positions
for (const db of order) {
  const positions = perDb.get(db)
  if (!positions) continue
  const taken = new Set<string>(used)
  for (const p of positions.values()) {
    const known = idOf.get(p.key)
    if (known) {
      ;(p as Pos & { id: string }).id = known
      continue
    }
    const seq = (p.label && seqOfLabel.get(p.label)) ?? 'joseki'
    const id = p.isStart && !taken.has(seq) ? seq : nextId(seq, depth.get(p.key) ?? 0, (x) => taken.has(x) || x === seq)
    taken.add(id)
    idOf.set(p.key, id)
    ;(p as Pos & { id: string }).id = id
  }
  for (const id of taken) used.add(id)
}

for (const [db, positions] of perDb) {
  const out = new Map<string, DbFile>()
  for (const p of positions.values()) {
    const home = (p.label && fileOfLabel.get(db + '|' + p.label)) ?? p.file
    const path = home.replace(/\.sgf$/, '.json')
    if (!out.has(path)) out.set(path, { db, path, positions: [] })
    const rec: PosRec = {
      id: (p as Pos & { id: string }).id,
      stones: stonesOf(p.board),
      toPlay: colorOf(p.toMove),
      free: (p.label && freeOfLabel.get(p.label)) ?? 'corner',
      data: p.data,
      moves: p.moves.map((m) => ({ move: moveText(m.pt), to: (positions.get(m.child) as Pos & { id: string }).id, data: m.data })),
    }
    out.get(path)!.positions.push(rec)
  }
  for (const f of out.values()) writeFileSync(join(ROOT, f.path), writeDbFile(f))
}
for (const path of files) unlinkSync(join(ROOT, path))
console.log(`Converted ${files.length} SGF files: ${all.length} positions.`)
