// Minimal type declarations for the Sabaki libraries (they ship without types).

declare module '@sabaki/sgf' {
  export interface SgfNode {
    id: number | string
    data: Record<string, string[]>
    parentId: number | string | null
    children: SgfNode[]
  }
  export function parse(contents: string, options?: Record<string, unknown>): SgfNode[]
  export function stringify(nodes: SgfNode[] | SgfNode, options?: Record<string, unknown>): string
  export function parseVertex(input: string): [number, number]
  export function stringifyVertex(vertex: [number, number]): string
  export function parseCompressedVertices(input: string): [number, number][]
}

declare module '@sabaki/go-board' {
  type Vertex = [number, number]
  type Sign = -1 | 0 | 1
  export default class GoBoard {
    constructor(signMap?: Sign[][])
    static fromDimensions(width: number, height?: number): GoBoard
    width: number
    height: number
    signMap: Sign[][]
    get(vertex: Vertex): Sign | null
    set(vertex: Vertex, sign: Sign): GoBoard
    clone(): GoBoard
    makeMove(sign: Sign, vertex: Vertex, options?: { preventSuicide?: boolean; preventOverwrite?: boolean; preventKo?: boolean }): GoBoard
  }
}

