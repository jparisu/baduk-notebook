/**
 * Session lines (SPEC §8.3): every line you play outside the databases is kept, like on OGS,
 * until you save it to a database or erase it. Also remembers the last position.
 */
import type { Move, Start } from './view'

export interface Line {
  start: Start
  moves: Move[]
}

const SESSION = 'baduk-notebook.session.v1'
const POSITION = 'baduk-notebook.position.v1'

const sameMove = (a: Move, b: Move) => a.sign === b.sign && (a.pt === null ? b.pt === null : !!b.pt && a.pt[0] === b.pt[0] && a.pt[1] === b.pt[1])
export const sameStart = (a: Start, b: Start) => JSON.stringify(a) === JSON.stringify(b)
const isPrefix = (a: Move[], b: Move[]) => a.length <= b.length && a.every((m, i) => sameMove(m, b[i]))

/** Adds a line, replacing lines it extends and ignoring it if a longer line already contains it. */
export function record(lines: Line[], line: Line): Line[] {
  const same = lines.filter((l) => sameStart(l.start, line.start))
  if (same.some((l) => isPrefix(line.moves, l.moves))) return lines
  return [...lines.filter((l) => !(sameStart(l.start, line.start) && isPrefix(l.moves, line.moves))), line]
}

/** Erases the variation that starts with the last move of `moves`: every line through it is cut just before it. */
export function erase(lines: Line[], start: Start, moves: Move[]): Line[] {
  if (!moves.length) return lines
  const parent = moves.slice(0, -1)
  const cut = lines.map((l) => (sameStart(l.start, start) && isPrefix(moves, l.moves) ? { ...l, moves: parent } : l))
  // Drop lines that are now contained in another one.
  return cut.filter((l, i) => l.moves.length > 0 && !cut.some((o, j) => j !== i && sameStart(o.start, l.start) && isPrefix(l.moves, o.moves) && (o.moves.length > l.moves.length || j < i)))
}

export function remove(lines: Line[], line: Line): Line[] {
  return lines.filter((l) => !(sameStart(l.start, line.start) && l.moves.length === line.moves.length && isPrefix(l.moves, line.moves)))
}

export function loadSession(): Line[] {
  try {
    return JSON.parse(localStorage.getItem(SESSION) ?? '[]')
  } catch {
    return []
  }
}
export function saveSession(lines: Line[]) {
  try {
    localStorage.setItem(SESSION, JSON.stringify(lines))
  } catch {
    /* ignore */
  }
}
export function loadPosition(): Line | null {
  try {
    return JSON.parse(localStorage.getItem(POSITION) ?? 'null')
  } catch {
    return null
  }
}
export function savePosition(line: Line) {
  try {
    localStorage.setItem(POSITION, JSON.stringify(line))
  } catch {
    /* ignore */
  }
}
