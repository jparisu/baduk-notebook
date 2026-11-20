/** Quiz cards and spaced repetition (SPEC §9): SM-2 style scheduling with Again / Hard / Good / Easy. */
import type { Graph } from '../core/graph'
import { CATEGORIES, categoryOf } from '../core/kinds'
import { edgeCategory } from '../core/graph'
import { indexLines } from '../core/search'
import { storageKey } from '../storage'

export type Rating = 'again' | 'hard' | 'good' | 'easy'

export interface CardState {
  ease: number
  interval: number // days
  reps: number
  due: number // ms timestamp
  seen: number
  correct: number
}

export interface Card {
  id: string
  entryId: string
  keys: string[]
  /** Side to answer: 1 Black, -1 White (canonical colors). */
  sign: 1 | -1
  kind: 'main' | 'mistake' | 'punish'
}

export interface Progress {
  cards: Record<string, CardState>
  days: string[] // ISO dates with at least one review (for the streak)
}

const DAY = 86_400_000

export function review(s: CardState | undefined, r: Rating, now = Date.now()): CardState {
  const cur = s ?? { ease: 2.5, interval: 0, reps: 0, due: now, seen: 0, correct: 0 }
  const q = { again: 1, hard: 3, good: 4, easy: 5 }[r]
  let { ease, interval, reps } = cur
  if (q < 3) {
    reps = 0
    interval = 0 // again today
  } else {
    reps++
    interval = reps === 1 ? 1 : reps === 2 ? (q === 5 ? 4 : 3) : Math.round(interval * ease * (q === 3 ? 0.8 : q === 5 ? 1.3 : 1))
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  return {
    ease,
    interval,
    reps,
    due: q < 3 ? now + 10 * 60_000 : now + interval * DAY,
    seen: cur.seen + 1,
    correct: cur.correct + (q >= 3 ? 1 : 0),
  }
}

/** Every position with a good answer becomes a card. */
export function buildCards(g: Graph, active: Set<string>, order: string[]): Card[] {
  const out: Card[] = []
  const lines = indexLines(g, active)
  for (const [key, owners] of lines) {
    const node = g.nodes.get(key)!
    const edges = node.edges.filter((e) => e.contribs.some((c) => active.has(c.db)))
    for (const sign of [1, -1] as const) {
      const mine = edges.filter((e) => e.sign === sign)
      const good = mine.filter((e) => {
        const c = edgeCategory(e, active, order)
        return c && CATEGORIES[c].good
      })
      if (!good.length) continue
      // One card per position: use the most specific label (shortest line from its first node).
      for (const o of [...owners].sort((a, b) => a.keys.length - b.keys.length).slice(0, 1)) {
        // Was the move that led here a mistake? Then this card is about punishing it.
        const prev = o.keys.length > 1 ? g.nodes.get(o.keys[o.keys.length - 2])!.edges.find((e) => e.child === key) : undefined
        const prevCat = prev ? prev.contribs.map((c) => categoryOf(c.rec.tags)).find(Boolean) : null
        const kind = good.some((e) => edgeCategory(e, active, order) === 'punish') ? 'punish' : prevCat && !CATEGORIES[prevCat].good ? 'mistake' : 'main'
        out.push({ id: `${o.entryId}|${key}|${sign}`, entryId: o.entryId, keys: o.keys, sign, kind })
      }
    }
  }
  return out
}

export interface Queue {
  due: Card[]
  fresh: Card[]
}

export function queue(cards: Card[], p: Progress, now = Date.now(), newPerDay = 10): Queue {
  const due = cards.filter((c) => p.cards[c.id] && p.cards[c.id].due <= now).sort((a, b) => p.cards[a.id].due - p.cards[b.id].due)
  const fresh = cards.filter((c) => !p.cards[c.id]).slice(0, newPerDay)
  return { due, fresh }
}

export function streak(days: string[], today = new Date()): number {
  const set = new Set(days)
  let n = 0
  const d = new Date(today)
  for (;;) {
    const iso = d.toISOString().slice(0, 10)
    if (!set.has(iso)) return n
    n++
    d.setDate(d.getDate() - 1)
  }
}

const KEY = storageKey('baduk-notebook.quiz.v1')
export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { cards: {}, days: [] }
}
export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}
