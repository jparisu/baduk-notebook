import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as sgf from '@sabaki/sgf'
import { buildGraph } from './graph'
import { IDENTITY, parsePt } from './geometry'
import { candidates, playFree, primaryLabel, startStep, type Ctx } from '../view'

const files = readdirSync('db/general/joseki').map((f) => ({ db: 'general', path: `general/joseki/${f}`, roots: sgf.parse(readFileSync(`db/general/joseki/${f}`, 'utf8')) }))
const g = buildGraph(files)
const ctx: Ctx = { graph: g, active: new Set(['general']), order: ['general'], U: IDENTITY }

describe('corner connectors', () => {
  it('each first move from the empty corner reaches its connector, which opens the joseki', () => {
    const empty = startStep(ctx, { kind: 'empty' })
    for (const [pt, label, min] of [['Q16', '4-4-point', 2], ['R16', '3-4-point', 2], ['R17', '3-3-point', 2]] as const) {
      const s = playFree(ctx, empty, 1, parsePt(pt)!)
      expect(primaryLabel(ctx, [empty, s])).toBe(label)
      const next = candidates(ctx, s)
      expect(next.length).toBeGreaterThanOrEqual(min)
      // every approach leads into a named joseki
      for (const c of next.filter((c) => c.pt)) expect(primaryLabel(ctx, [empty, s, c.step])).not.toBe(label)
    }
  })

  it('joseki start from a single stone', () => {
    for (const f of files) {
      const root = f.roots[0]
      const stones = (root.data.AB?.length ?? 0) + (root.data.AW?.length ?? 0)
      expect(stones, f.path).toBeLessThanOrEqual(1)
    }
  })
})
