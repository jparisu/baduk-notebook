import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as sgf from '@sabaki/sgf'
import { buildGraph, labelsAt } from './graph'
import { IDENTITY, parsePt } from './geometry'
import { candidates, playFree, primaryLabel, startStep, type Ctx } from '../view'

const load = (p: string) => ({ db: p.split('/')[0], path: p, roots: sgf.parse(readFileSync(`db/${p}`, 'utf8')) })

describe('labels', () => {
  const tree = {
    db: 'mine',
    path: 'mine/joseki/tree.sgf',
    roots: sgf.parse('(;FF[4]XID[root]XNAME[Root]PL[B];B[pd];W[qc]XID[inv]XNAME[Invasion];B[pc];W[qd])'),
  }
  const g = buildGraph([load('general/joseki/empty-corner.sgf'), load('general/joseki/4-4-3-3-invasion.sgf'), tree])
  const ctx: Ctx = { graph: g, active: new Set(['general', 'mine']), order: ['general', 'mine'], U: IDENTITY }

  it('a label set on a deep node is inherited by the following nodes', () => {
    let s = startStep(ctx, { kind: 'empty' })
    const line = [s]
    for (const p of ['Q16', 'R17', 'Q17', 'R16']) {
      s = playFree(ctx, s, line.length % 2 ? 1 : -1, parsePt(p)!)
      line.push(s)
    }
    expect(labelsAt(g, line[1].key, ctx.active)).toContain('root')
    expect(labelsAt(g, line[2].key, ctx.active)).toContain('inv')
    expect(labelsAt(g, line[4].key, ctx.active)).toContain('inv')
    expect(g.entries.get('inv')!.root).toBe(line[2].key)
  })

  it('the most specific label wins along the line', () => {
    let s = startStep(ctx, { kind: 'empty' })
    expect(candidates(ctx, s).length).toBeGreaterThanOrEqual(5)
    const line = [s]
    s = playFree(ctx, s, 1, parsePt('Q16')!)
    line.push(s)
    expect(primaryLabel(ctx, line)).toBe('4-4-3-3-invasion')
    s = playFree(ctx, s, -1, parsePt('R17')!)
    line.push(s)
    expect(['4-4-3-3-invasion', 'inv']).toContain(primaryLabel(ctx, line))
  })
})
