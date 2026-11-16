/** Validates every SGF file in db/ (run in CI on each pull request). */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as sgf from '@sabaki/sgf'
import { validateAll } from './validate'
import { buildGraph } from './graph'

const ROOT = 'db'
function list(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = join(dir, n)
    return statSync(full).isDirectory() ? list(full) : n.endsWith('.sgf') ? [relative(ROOT, full).split(sep).join('/')] : []
  })
}

describe('databases in db/', () => {
  const index = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8')) as { databases: { id: string }[] }
  const files = list(ROOT).map((path) => ({ db: path.split('/')[0], path, roots: sgf.parse(readFileSync(join(ROOT, path), 'utf8')) }))

  it('index.json lists databases with unique ids', () => {
    const ids = index.databases.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every SGF file is valid', () => {
    const issues = validateAll(files, new Set(index.databases.map((d) => d.id))).filter((i) => i.severity === 'error')
    expect(issues.map((i) => `${i.file}: ${i.message}`)).toEqual([])
  })

  it('every database loads into the position graph', () => {
    const g = buildGraph(files)
    expect(g.entries.size).toBeGreaterThan(0)
  })
})
