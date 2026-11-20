import { describe, expect, it } from 'vitest'
import { boardOf, isStartId, nOf, nextId, parseDbFile, seqName, seqOf, stonesOf, writeDbFile } from './model'
import { listDb, readDb } from '../testdb'

describe('data model', () => {
  it('every database file survives reading and writing unchanged', () => {
    for (const p of listDb()) {
      const r = readDb(p)
      expect(writeDbFile(parseDbFile(r.db, r.path, r.text)), p).toBe(r.text)
    }
  })

  it('ids: sequence, N and branch letters', () => {
    expect(seqOf('joseki/4-4 point/3-3 invasion:5b')).toBe('joseki/4-4 point/3-3 invasion')
    expect(nOf('joseki/4-4 point:5b')).toBe(5)
    expect(isStartId('joseki/4-4 point')).toBe(true)
    expect(seqName('joseki/4-4 point/3-3 invasion')).toBe('3-3 invasion')
    const taken = new Set(['s:4', 's:4b'])
    expect(nextId('s', 4, (x) => taken.has(x))).toBe('s:4c')
  })

  it('stones round-trip through a board', () => {
    expect(stonesOf(boardOf('W:qc B:pd,pc'))).toBe('B:pc,pd W:qc')
  })
})
