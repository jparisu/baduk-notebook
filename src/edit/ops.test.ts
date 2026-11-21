import { describe, expect, it } from 'vitest'
import { buildGraph } from '../core/graph'
import { IDENTITY, parsePt } from '../core/geometry'
import { writeDbFile } from '../core/model'
import { candidates, rootStep, type Ctx, type Step } from '../view'
import { createWorkspace, changes, makePatch } from './workspace'
import { addMove, checkMove, createDatabase, deleteMove, locate, nameSequence, setComments, setTags } from './ops'
import { listDb, readDb } from '../testdb'

const DBS = [
  { id: 'general', name: 'General', description: '', color: '#000', activeByDefault: true },
  { id: 'jparisu', name: 'jparisu', description: '', color: '#000', activeByDefault: true },
]
const INV = 'joseki/4-4 point/3-3 invasion'

function setup() {
  const ws = createWorkspace(DBS, listDb().map(readDb))
  const ctxOf = (): Ctx => ({ graph: buildGraph(ws.files), active: new Set(['general', 'jparisu', 'mine']), order: ['general', 'jparisu', 'mine'], U: IDENTITY })
  let ctx = ctxOf()
  /** The 3-3 invasion line: 4-4 stone, then the first move each time. */
  const line = (n: number): Step[] => {
    const p = [rootStep(ctx, 'joseki/4-4 point')]
    p.push(candidates(ctx, p[0]).find((c) => c.pt && c.pt[0] === 16 && c.pt[1] === 2)!.step) // R17
    for (let i = 1; i < n; i++) p.push(candidates(ctx, p[p.length - 1])[0].step)
    return p
  }
  const all = (db: string) => ws.files.filter((f) => f.db === db).flatMap((f) => f.positions)
  return { ws, ctx: () => ctx, rebuild: () => (ctx = ctxOf()), line, all }
}

describe('edit operations', () => {
  it('adds a move: the new position gets the sequence of the one it comes from and the next N', () => {
    const t = setup()
    const path = t.line(5)
    const last = t.ctx().graph.nodes.get(path[5].key)!.contribs[0].pos
    const free = [...'ABCDEFGHJKLMNOPQRST'].map((c) => parsePt(c + '12')!).find((pt) => checkMove(t.ctx(), path, -1, pt).ok)!
    addMove(t.ws, t.ctx(), path, 'general', INV, -1, free)
    t.rebuild()
    const c = candidates(t.ctx(), path[5]).find((c) => c.pt && c.pt[0] === free[0] && c.pt[1] === free[1])!
    expect(c.dbs).toEqual(['general'])
    const added = t.ctx().graph.nodes.get(c.step.key)!.contribs[0].pos
    expect(added.id.split(':')[0]).toBe(last.id.split(':')[0])
    expect(added.id).toMatch(new RegExp(`:${t.ctx().graph.depth.get(path[5].key)! + 1}[a-z]*$`))
    expect(t.ctx().graph.problems).toEqual([])
  })

  it('refuses occupied points, loops and two tenukis in a row', () => {
    const t = setup()
    const p = t.line(1)
    expect(checkMove(t.ctx(), p, 1, parsePt('Q16')!).ok).toBe(false)
    const tenuki = [...p, { ...p[1], key: 'x', edge: undefined, free: { sign: 1 as const, pt: null } }]
    expect(checkMove(t.ctx(), tenuki, -1, null).ok).toBe(false)
  })

  it('writes comments and tags into a new database: the line is created there with the same ids', () => {
    const t = setup()
    expect(createDatabase(t.ws, { id: 'mine', name: 'Mine', description: '', color: '#123456', activeByDefault: true })).toBeNull()
    const path = t.line(2)
    const loc = locate(t.ws, t.ctx(), path, 'mine', INV, true)!
    setTags(t.ws, loc, 'move', { kind: 'main', 'my-own-key': 3 })
    setComments(t.ws, loc, 'pos', ['My note', ' '])
    expect(loc.move?.tags).toEqual({ kind: 'main', 'my-own-key': 3 })
    expect(loc.pos.comments).toEqual(['My note'])
    setTags(t.ws, loc, 'move', { 'my-own-key': null })
    expect(loc.move?.tags).toEqual({ kind: 'main' })
    t.rebuild()
    const node = t.ctx().graph.nodes.get(path[2].key)!
    const ids = new Set(node.contribs.map((c) => c.pos.id))
    expect(ids.size).toBe(1) // the same id as in the other databases
    expect(t.ctx().graph.problems).toEqual([])
    const patch = makePatch(changes(t.ws))
    expect(patch).toContain('diff --git a/db/index.json b/db/index.json')
    expect(patch).toContain('new file mode 100644')
    expect(patch).toMatch(/\+\+\+ b\/db\/mine\/joseki\/.*\.json/)
  })

  it('deletes only the target database\'s copy of a move, and the positions only it reached', () => {
    const t = setup()
    const path = t.line(2)
    const before = t.all('jparisu').length
    expect(deleteMove(t.ws, path, 'jparisu')).toBe(true)
    t.rebuild()
    expect(candidates(t.ctx(), path[1])[0].dbs).toEqual(['general'])
    expect(t.all('jparisu').length).toBeLessThan(before)
    expect(t.ctx().graph.problems).toEqual([])
  })

  it('naming a position starts a sequence and moves the following positions into it', () => {
    const t = setup()
    const path = t.line(2)
    expect(nameSequence(t.ws, t.ctx(), path, 'general', `${INV}/test`, 'Test')).toBeNull()
    t.rebuild()
    const g = t.ctx().graph
    expect(g.entries.get(`${INV}/test`)?.root).toBe(path[2].key)
    const next = candidates(t.ctx(), path[2])[0]
    expect(g.nodes.get(next.step.key)!.contribs.find((c) => c.db === 'general')!.pos.id.startsWith(`${INV}/test:`)).toBe(true)
    expect(g.problems).toEqual([])
    expect(writeDbFile(t.ws.files.find((f) => f.positions.some((p) => p.id === `${INV}/test`))!)).toMatch(/"name": \[\s*"Test"/)
  })
})
