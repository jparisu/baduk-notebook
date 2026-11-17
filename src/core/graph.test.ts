import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as sgf from '@sabaki/sgf'
import { buildGraph, visibleEdges } from './graph'

const load = (db: string, path: string) => ({ db, path, roots: sgf.parse(readFileSync(`db/${db}/${path}`, 'utf8')) })

describe('position graph', () => {
  const g = buildGraph([
    load('general', 'joseki/4-4-3-3-invasion.sgf'),
    load('jparisu', 'joseki/4-4-3-3-invasion-notes.sgf'),
    load('general', 'shapes/straight-three-side.sgf'),
  ])
  const entry = g.entries.get('4-4-3-3-invasion')!

  it('reads entries', () => {
    expect(entry.type).toBe('joseki')
    expect(g.entries.get('straight-three-side')!.type).toBe('shape')
  })

  it('joins the personal notes written in another corner with the general entry', () => {
    let key = entry.root
    const root = g.nodes.get(key)!
    expect(root.contribs.map((c) => c.db).sort()).toEqual(['general', 'jparisu'])
    // follow the jparisu line six moves; every move must join an edge that general also has
    for (let i = 0; i < 6; i++) {
      const e = visibleEdges(g, key, new Set(['general', 'jparisu'])).find((e) => e.contribs.some((c) => c.db === 'jparisu'))!
      expect(e.contribs.some((c) => c.db === 'general')).toBe(true)
      key = e.child
    }
    expect(g.nodes.get(key)!.contribs.some((c) => c.db === 'jparisu' && c.props.XPN)).toBe(true)
  })

  it('hides moves of inactive databases', () => {
    expect(visibleEdges(g, entry.root, new Set(['jparisu'])).length).toBe(1)
    expect(visibleEdges(g, entry.root, new Set<string>()).length).toBe(0)
  })
})
