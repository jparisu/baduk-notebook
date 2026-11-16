import { describe, expect, it } from 'vitest'
import * as sgf from '@sabaki/sgf'
import { writeSgf } from './sgfio'

describe('writeSgf', () => {
  it('writes normalized SGF that parses back to the same tree', () => {
    const text = '(;XNAME[a]FF[4]AB[pd]XMW[x \\] y];W[qc](;B[pc]XCAT[main])(;B[]XCAT[slack]))'
    const out = writeSgf(sgf.parse(text))
    expect(out).toBe('(;FF[4]XNAME[a]AB[pd]XMW[x \\] y]\n;W[qc]\n(;B[pc]XCAT[main])\n(;B[]XCAT[slack]))\n')
    const back = sgf.parse(out)[0]
    expect(back.data.XMW).toEqual(['x ] y'])
    expect(back.children[0].children.length).toBe(2)
  })
})
