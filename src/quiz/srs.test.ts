import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as sgf from '@sabaki/sgf'
import { buildGraph } from '../core/graph'
import { buildCards, queue, review, streak } from './srs'

describe('spaced repetition', () => {
  it('schedules longer intervals after good answers and resets after again', () => {
    const now = 0
    let s = review(undefined, 'good', now)
    expect(s.interval).toBe(1)
    s = review(s, 'good', now)
    expect(s.interval).toBe(3)
    s = review(s, 'good', now)
    expect(s.interval).toBeGreaterThan(5)
    s = review(s, 'again', now)
    expect(s.interval).toBe(0)
    expect(s.due).toBe(10 * 60_000)
    expect(s.correct).toBe(3)
  })

  it('counts a streak of consecutive days', () => {
    expect(streak(['2026-11-14', '2026-11-15', '2026-11-16'], new Date('2026-11-16T12:00:00Z'))).toBe(3)
    expect(streak(['2026-11-14'], new Date('2026-11-16T12:00:00Z'))).toBe(0)
  })

  it('builds cards from the example databases', () => {
    const files = ['general/joseki/4-4-3-3-invasion.sgf', 'general/shapes/straight-three-side.sgf'].map((p) => ({ db: 'general', path: p, roots: sgf.parse(readFileSync(`db/${p}`, 'utf8')) }))
    const g = buildGraph(files)
    const cards = buildCards(g, new Set(['general']), ['general'])
    expect(cards.some((c) => c.kind === 'punish')).toBe(true)
    expect(cards.some((c) => c.entryId === 'straight-three-side')).toBe(true)
    const q = queue(cards, { cards: {}, days: [] }, 0, 5)
    expect(q.fresh.length).toBe(5)
  })
})
