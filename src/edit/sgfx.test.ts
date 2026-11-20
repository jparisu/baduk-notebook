import { describe, expect, it } from 'vitest'
import { buildGraph } from '../core/graph'
import { IDENTITY, parsePt } from '../core/geometry'
import { candidates, startStep, type Ctx } from '../view'
import { createWorkspace } from './workspace'
import { importSgf, toSgf } from './sgfx'
import { listDb, readDb } from '../testdb'

const DBS = [{ id: 'general', name: 'General', description: '', color: '#000', activeByDefault: true }, { id: 'mine', name: 'Mine', description: '', color: '#000', activeByDefault: true }]

describe('SGF', () => {
  it('downloads a position with the moves after it', () => {
    const ws = createWorkspace(DBS, listDb().filter((p) => p.startsWith('general/')).map(readDb))
    const ctx: Ctx = { graph: buildGraph(ws.files), active: new Set(['general']), order: ['general'], U: IDENTITY }
    const text = toSgf(ctx, startStep(ctx, { kind: 'label', id: 'joseki/4-4 point' }))
    expect(text).toContain('AB[pd]')
    expect(text).toContain('PL[W]')
    expect(text).toContain('W[qc]')
  })

  it('loads an SGF into a database, inserting a tenuki where the same color plays twice', () => {
    const ws = createWorkspace(DBS, [])
    const ctxOf = (): Ctx => ({ graph: buildGraph(ws.files), active: new Set(['mine']), order: ['mine'], U: IDENTITY })
    const n = importSgf(ws, ctxOf, '(;FF[4]AB[pd]PL[W];W[qc]C[Invasion](;B[pc];W[qd])(;B[od];B[oc]))', 'mine')
    expect(n).toBe(5)
    const ctx = ctxOf()
    expect(ctx.graph.problems).toEqual([])
    const s = startStep(ctx, { kind: 'setup', B: [parsePt('Q16')!], W: [], toMove: -1 })
    const after = candidates(ctx, s)
    expect(after.length).toBe(1)
    expect(candidates(ctx, after[0].step).length).toBe(2)
    expect(ws.files.length).toBe(1)
  })
})
