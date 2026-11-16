import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildGraph } from '../core/graph'
import { IDENTITY, parsePt } from '../core/geometry'
import { candidates, rootStep, type Ctx, type Step } from '../view'
import { createWorkspace, changes, makePatch } from './workspace'
import { addMove, checkMove, createDatabase, deleteMove, locate, setProps } from './ops'
import { writeSgf } from './sgfio'

const read = (p: string) => ({ db: p.split('/')[0], path: p, text: readFileSync(`db/${p}`, 'utf8') })
const DBS = [
  { id: 'general', name: 'General', description: '', color: '#000', activeByDefault: true },
  { id: 'jparisu', name: 'jparisu', description: '', color: '#000', activeByDefault: true },
]

function setup() {
  const ws = createWorkspace(DBS, [read('general/joseki/4-4-3-3-invasion.sgf'), read('jparisu/joseki/4-4-3-3-invasion-notes.sgf')])
  const ctxOf = (): Ctx => ({ graph: buildGraph(ws.files), active: new Set(['general', 'jparisu', 'mine']), order: ['general', 'jparisu', 'mine'], U: IDENTITY })
  let ctx = ctxOf()
  const line = (n: number): Step[] => {
    const p = [rootStep(ctx, '4-4-3-3-invasion')]
    for (let i = 0; i < n; i++) p.push(candidates(ctx, p[p.length - 1])[0].step)
    return p
  }
  return { ws, ctx: () => ctx, rebuild: () => (ctx = ctxOf()), line }
}

describe('edit operations', () => {
  it('adds a move into an existing file stored in another corner, in that file\'s frame', () => {
    const t = setup()
    const path = t.line(6) // after Black P18, White to play
    const r18 = parsePt('R18')!
    expect(checkMove(t.ctx(), path, -1, r18)).toEqual({ ok: true, joins: false })
    addMove(t.ws, t.ctx(), path, 'jparisu', '4-4-3-3-invasion', -1, r18)
    t.rebuild()
    const c = candidates(t.ctx(), path[path.length - 1]).find((c) => c.pt && c.pt[0] === r18[0] && c.pt[1] === r18[1])!
    expect(c.dbs).toEqual(['jparisu'])
    // R18 rotated 180° is C2 = SGF "cr"
    expect(writeSgf(t.ws.files[1].roots)).toContain(';W[cr]')
  })

  it('refuses occupied points', () => {
    const t = setup()
    expect(checkMove(t.ctx(), t.line(1), 1, parsePt('Q16')!).ok).toBe(false)
  })

  it('creates a new notes file for a database that has none, and writes fields', () => {
    const t = setup()
    expect(createDatabase(t.ws, { id: 'mine', name: 'Mine', description: '', color: '#123456', activeByDefault: true })).toBeNull()
    const path = t.line(2)
    const loc = locate(t.ws, t.ctx(), path, 'mine', '4-4-3-3-invasion', true)!
    setProps(t.ws, loc, { XPN: ['My note'] })
    expect(loc.file.path).toBe('mine/joseki/4-4-3-3-invasion-notes.sgf')
    t.rebuild()
    const node = t.ctx().graph.nodes.get(path[2].key)!
    expect(node.contribs.some((c) => c.db === 'mine' && c.props.XPN?.[0] === 'My note')).toBe(true)
    const patch = makePatch(changes(t.ws))
    expect(patch).toContain('diff --git a/db/index.json b/db/index.json')
    expect(patch).toContain('new file mode 100644')
    expect(patch).toContain('+++ b/db/mine/joseki/4-4-3-3-invasion-notes.sgf')
  })

  it('deletes only the target database\'s copy of a move', () => {
    const t = setup()
    const path = t.line(2)
    expect(deleteMove(t.ws, path, 'jparisu')).toBe(true)
    t.rebuild()
    const c = candidates(t.ctx(), path[1])[0]
    expect(c.dbs).toEqual(['general'])
  })
})
