/** Validates every database file in db/ (run in CI on each pull request). */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateAll } from './validate'
import { loadDb, tagTexts } from '../testdb'
import { parseRegistry } from './tags'

describe('databases in db/', () => {
  const index = JSON.parse(readFileSync('db/index.json', 'utf8')) as { databases: { id: string }[] }
  it('index.json lists databases with unique ids', () => {
    const ids = index.databases.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('each database\'s tags.json is a list of tags with unique keys', () => {
    for (const [db, text] of Object.entries(tagTexts())) {
      const reg = parseRegistry(text)
      const keys = reg.tags.map((d) => d.key)
      expect(new Set(keys).size, db).toBe(keys.length)
      for (const d of reg.tags) expect(d.key && d.type, `${db}: ${d.key}`).toBeTruthy()
    }
    expect(Object.keys(tagTexts())).toContain('general')
  })
  it('every file is valid and every move leads where it says', () => {
    const issues = validateAll(loadDb(), new Set(index.databases.map((d) => d.id))).filter((i) => i.severity === 'error')
    expect(issues.map((i) => `${i.file} ${i.id}: ${i.message}`)).toEqual([])
  })
})
