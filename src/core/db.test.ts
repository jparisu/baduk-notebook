/** Validates every database file in db/ (run in CI on each pull request). */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateAll } from './validate'
import { loadDb } from '../testdb'

describe('databases in db/', () => {
  const index = JSON.parse(readFileSync('db/index.json', 'utf8')) as { databases: { id: string }[] }
  it('index.json lists databases with unique ids', () => {
    const ids = index.databases.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('every file is valid and every move leads where it says', () => {
    const issues = validateAll(loadDb(), new Set(index.databases.map((d) => d.id))).filter((i) => i.severity === 'error')
    expect(issues.map((i) => `${i.file} ${i.id}: ${i.message}`)).toEqual([])
  })
})
