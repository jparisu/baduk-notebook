import Board from '@sabaki/go-board'
import * as sgf from '@sabaki/sgf'
import type { SgfNode } from '@sabaki/sgf'

/** Path of nodes from the root to `target` (inclusive), or null if not found. */
export function pathTo(root: SgfNode, target: SgfNode): SgfNode[] | null {
  if (root === target) return [root]
  for (const child of root.children) {
    const p = pathTo(child, target)
    if (p) return [root, ...p]
  }
  return null
}

/** Board after playing every node on the path (set-up stones, then moves). Empty B[]/W[] is a pass (tenuki). */
export function boardAt(path: SgfNode[]): Board {
  let board = Board.fromDimensions(19)
  for (const node of path) {
    for (const [prop, sign] of [['AB', 1], ['AW', -1], ['AE', 0]] as const) {
      for (const value of node.data[prop] ?? []) {
        for (const v of sgf.parseCompressedVertices(value)) board = board.set(v, sign)
      }
    }
    for (const [prop, sign] of [['B', 1], ['W', -1]] as const) {
      const value = node.data[prop]?.[0]
      if (value) board = board.makeMove(sign, sgf.parseVertex(value))
    }
  }
  return board
}

export function moveOf(node: SgfNode): { color: 'B' | 'W'; vertex: [number, number] | null } | null {
  for (const color of ['B', 'W'] as const) {
    const value = node.data[color]
    if (value) return { color, vertex: value[0] ? sgf.parseVertex(value[0]) : null }
  }
  return null
}

const COLS = 'ABCDEFGHJKLMNOPQRST'
export const coordName = ([x, y]: [number, number]) => `${COLS[x]}${19 - y}`
