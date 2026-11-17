/** Normalized SGF writer (SPEC §10 step 7): stable property order, one node per line, so diffs stay small. */
import type { SgfNode } from '@sabaki/sgf'

const ORDER = [
  'FF', 'CA', 'GM', 'SZ', 'C',
  'XID', 'XTYPE', 'XNAME', 'XALIAS', 'XFAM', 'XDIFF', 'XERA', 'XSTART', 'XTAG', 'XSUM', 'XSRC',
  'XSIZE', 'XLOC', 'XSURR', 'XOLIB', 'XINSIDE', 'XARR', 'XRESB', 'XRESW', 'XVITAL', 'XKOT', 'XRULE', 'XREG',
  'AB', 'AW', 'AE', 'PL',
  'B', 'W', 'XCAT', 'XSTY', 'XPUR', 'XCOND', 'XMW', 'XMN', 'XLINK', 'TE', 'BM', 'DO', 'IT',
  'XST', 'XEV', 'XPB', 'XPBS', 'XSEN', 'XSB', 'XSW', 'XEYE', 'XLIB', 'XRES', 'XTEN', 'XAJI', 'XPW', 'XPN',
  'TR', 'SQ', 'CR', 'MA', 'LB', 'AR', 'LN', 'XWALL', 'XINF', 'XTB', 'XTW', 'XMOYO', 'XCUT', 'XEYEM', 'XWEAK', 'XLAD',
]
const rank = (k: string) => {
  const i = ORDER.indexOf(k)
  return i < 0 ? ORDER.length : i
}
const escape = (v: string) => v.replace(/\\/g, '\\\\').replace(/]/g, '\\]')

function nodeText(n: SgfNode): string {
  const keys = Object.keys(n.data)
    .filter((k) => n.data[k] && n.data[k].length)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  return ';' + keys.map((k) => k + n.data[k].map((v) => `[${escape(v)}]`).join('')).join('')
}

function seq(n: SgfNode): string {
  let out = nodeText(n)
  if (n.children.length === 1) out += '\n' + seq(n.children[0])
  else for (const c of n.children) out += '\n(' + seq(c) + ')'
  return out
}

export function writeSgf(roots: SgfNode[]): string {
  return roots.map((r) => '(' + seq(r) + ')').join('\n') + '\n'
}

let counter = 0
export function newNode(data: Record<string, string[]>, parent: SgfNode | null): SgfNode {
  const n: SgfNode = { id: `new-${Date.now().toString(36)}-${counter++}`, data, parentId: parent ? parent.id : null, children: [] }
  if (parent) parent.children.push(n)
  return n
}

export const sgfPoint = ([x, y]: [number, number]) => String.fromCharCode(97 + x) + String.fromCharCode(97 + y)

/** Finds the parent of a node inside a list of trees. */
export function findParent(roots: SgfNode[], target: SgfNode): SgfNode | null {
  const walk = (n: SgfNode): SgfNode | null => {
    for (const c of n.children) {
      if (c === target) return n
      const r = walk(c)
      if (r) return r
    }
    return null
  }
  for (const r of roots) {
    const p = walk(r)
    if (p) return p
  }
  return null
}
