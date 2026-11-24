import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mergeRegistries, movePoint, resolveLinks, setRegistry, getRegistry, type TagRegistry } from './tags'
import { checkTag } from './validate'
import { SYMMETRIES } from './geometry'

describe('tags of several databases', () => {
  const general: TagRegistry = { tags: [
    { key: 'kind', label: 'Kind', type: 'choice', options: [{ value: 'main', label: 'Main move' }, { value: 'mistake', label: 'Mistake' }] },
    { key: 'difficulty', label: 'Difficulty', type: 'rank' },
  ] }
  const mine: TagRegistry = { tags: [
    { key: 'kind', label: 'My kind', type: 'text', options: [{ value: 'cute', label: 'Cute' }, { value: 'main', label: 'Mine' }] },
    { key: 'liberties', label: 'Liberties', type: 'number', min: 0, max: 20, step: 1 },
  ] }
  const merged = mergeRegistries([{ db: 'general', registry: general }, { db: 'mine', registry: mine }])
  it('a later database adds tags and options, without changing what an earlier one defined', () => {
    const kind = merged.tags.find((d) => d.key === 'kind')!
    expect(kind).toMatchObject({ label: 'Kind', type: 'choice', db: 'general' })
    expect(kind.options!.map((o) => [o.value, o.label, o.db])).toEqual([['main', 'Main move', 'general'], ['mistake', 'Mistake', 'general'], ['cute', 'Cute', 'mine']])
    expect(merged.tags.find((d) => d.key === 'liberties')).toMatchObject({ db: 'mine', type: 'number' })
  })
  it('merging does not change the stored tags', () => {
    expect(general.tags[0].options!.length).toBe(2)
    expect('db' in general.tags[0]).toBe(false)
  })
})

describe('tag values', () => {
  it('a number keeps to its range and step', () => {
    const old = getRegistry()
    setRegistry({ tags: [{ key: 'n', label: 'N', type: 'number', min: 0, max: 10, step: 0.5 }] })
    const errs = (v: number) => { const out: string[] = []; checkTag('n', v, (m) => out.push(m)); return out }
    expect(errs(2.5)).toEqual([])
    expect(errs(11)).toEqual(['n: 11 is above 10'])
    expect(errs(2.3)).toEqual(['n: 2.3 is not a multiple of 0.5'])
    setRegistry(old)
  })
  it('a board point turns with the board', () => {
    expect(movePoint('Q16', SYMMETRIES[1])).toBe('D16') // mirrored left–right
    expect(movePoint('Q16', SYMMETRIES[0])).toBe('Q16')
  })
})

describe('linked tags', () => {
  const reg: TagRegistry = { tags: [
    { key: 'black-first', label: 'Black plays first', type: 'choice', control: 'buttons', options: [{ value: 'B-alive', label: 'Black lives', color: '#151515' }] },
    { key: 'white-first', label: 'White plays first', type: 'text', like: 'black-first', description: 'If White plays first' },
    { key: 'third', label: 'Third', type: 'text', like: 'white-first', options: [{ value: 'extra', label: 'Extra' }] },
    { key: 'lost', label: 'Lost', type: 'number', like: 'nowhere' },
    { key: 'a', label: 'A', type: 'text', like: 'b' },
    { key: 'b', label: 'B', type: 'text', like: 'a' },
  ] }
  const r = resolveLinks(reg).tags
  const at = (k: string) => r.find((d) => d.key === k)!
  it('use the settings of the tag they are linked to, keeping their own name and meaning', () => {
    expect(at('white-first')).toMatchObject({ type: 'choice', control: 'buttons', label: 'White plays first', description: 'If White plays first' })
    expect(at('white-first').options).toEqual(reg.tags[0].options)
  })
  it('follow chains, and add their own options after the shared ones', () => {
    expect(at('third').type).toBe('choice')
    expect(at('third').options!.map((o) => o.value)).toEqual(['B-alive', 'extra'])
  })
  it('a link to a missing tag, or a loop, leaves the tag as it is', () => {
    expect(at('lost').type).toBe('number')
    expect(at('a').type).toBe('text')
  })
  it('the data: White plays first uses the settings of Black plays first', () => {
    const merged = mergeRegistries([{ db: 'general', registry: JSON.parse(readFileSync('db/general/tags.json', 'utf8')) }])
    const w = merged.tags.find((d) => d.key === 'white-first')!, b = merged.tags.find((d) => d.key === 'black-first')!
    expect(w.like).toBe('black-first')
    expect(w.options).toEqual(b.options)
  })
})

