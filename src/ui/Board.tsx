/** SVG Go board: stones, next-move markers, markup and overlays (SPEC §8.3, §11). */
import { CATEGORIES, type Category } from '../core/fields'
import { colName, SIZE, type Pt, type SignMap } from '../core/geometry'
import type { Mark } from '../core/refs'

export interface BoardMarker {
  pt: Pt
  /** Move color, shown inside the marker when either side may play (shapes). */
  sign: number
  showColor: boolean
  /** A good move that starts another named variation: drawn as a dashed ring. */
  variation?: boolean
  cat: Category | null
  title: string
  highlight: boolean
  onClick: () => void
}

interface Props {
  window: [number, number, number, number]
  board: SignMap
  last: Pt | null
  numbers: Map<string, number> | null
  markers: BoardMarker[]
  marks: Mark[]
  coordinates: boolean
  /** Called when any point is clicked (edit, find and quiz modes). Markers keep their own click. */
  onPoint?: (pt: Pt) => void
  /** Points picked but not used yet (e.g. first end of an arrow). */
  pending?: Pt[]
}

const STAR = [3, 9, 15]
const MARK_COLOR = 'var(--markup)'

function MarkShape({ m, board }: { m: Mark; board: SignMap }) {
  const col = m.color ?? MARK_COLOR
  const [p, q] = m.pts
  switch (m.type) {
    case 'TR':
      return <polygon points={`${p[0]},${p[1] - 0.28} ${p[0] - 0.26},${p[1] + 0.17} ${p[0] + 0.26},${p[1] + 0.17}`} fill="none" stroke={col} stroke-width=".09" />
    case 'SQ':
      return <rect x={p[0] - 0.22} y={p[1] - 0.22} width=".44" height=".44" fill="none" stroke={col} stroke-width=".09" />
    case 'CR':
      return <circle cx={p[0]} cy={p[1]} r=".25" fill="none" stroke={col} stroke-width=".09" />
    case 'MA':
      return <path d={`M${p[0] - 0.2} ${p[1] - 0.2}L${p[0] + 0.2} ${p[1] + 0.2}M${p[0] + 0.2} ${p[1] - 0.2}L${p[0] - 0.2} ${p[1] + 0.2}`} stroke={col} stroke-width=".09" />
    case 'LB': {
      const s = board[p[1]]?.[p[0]]
      return (
        <g>
          {!s && <circle cx={p[0]} cy={p[1]} r=".32" fill="var(--board)" />}
          <text x={p[0]} y={p[1] + 0.15} font-size=".42" text-anchor="middle" font-weight="700" fill={s === 1 ? '#fff' : s === -1 ? '#111' : col}>{m.label}</text>
        </g>
      )
    }
    case 'AR':
      return <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={col} stroke-width=".11" marker-end="url(#arrow)" style={{ color: col }} />
    case 'LN':
      return <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={col} stroke-width=".09" />
    case 'WALL':
      return <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={m.color ?? 'var(--wall)'} stroke-width=".55" stroke-linecap="round" opacity=".45" />
    case 'INF':
      return <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={m.color ?? 'var(--wall)'} stroke-width=".22" stroke-dasharray=".35 .2" marker-end="url(#arrow-wide)" opacity=".7" style={{ color: m.color ?? 'var(--wall)' }} />
    case 'TB':
    case 'TW':
      return (
        <g opacity=".38">
          {m.pts.map(([x, y]) => (
            <rect x={x - 0.5} y={y - 0.5} width="1" height="1" fill={m.color ?? (m.type === 'TB' ? '#111' : '#fff')} />
          ))}
        </g>
      )
    case 'EYE':
      // An eye: almond outline with a pupil.
      return (
        <g class="mark-eye">
          <path d={`M${p[0] - 0.34} ${p[1]}Q${p[0]} ${p[1] - 0.34} ${p[0] + 0.34} ${p[1]}Q${p[0]} ${p[1] + 0.34} ${p[0] - 0.34} ${p[1]}Z`} fill="none" stroke={col} stroke-width=".07" stroke-linejoin="round" />
          <circle cx={p[0]} cy={p[1]} r=".11" fill={col} />
        </g>
      )
    case 'CUT':
      return (
        <g>
          <circle cx={p[0]} cy={p[1]} r=".3" fill="none" stroke={col} stroke-width=".07" stroke-dasharray=".12 .08" />
          <path d={`M${p[0] - 0.15} ${p[1] - 0.15}L${p[0] + 0.15} ${p[1] + 0.15}M${p[0] + 0.15} ${p[1] - 0.15}L${p[0] - 0.15} ${p[1] + 0.15}`} stroke={col} stroke-width=".08" />
        </g>
      )
  }
}

export function Board({ window: win, board, last, numbers, markers, marks, coordinates, onPoint, pending }: Props) {
  const [x0, x1, y0, y1] = win
  const pad = coordinates ? 1.45 : 0.8
  const xs = x0 === 0 ? 0 : x0 - 0.75, xe = x1 === SIZE - 1 ? SIZE - 1 : x1 + 0.75
  const ys = y0 === 0 ? 0 : y0 - 0.75, ye = y1 === SIZE - 1 ? SIZE - 1 : y1 + 0.75
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
  const inWin = ([x, y]: Pt) => x >= x0 && x <= x1 && y >= y0 && y <= y1
  const below = marks.filter((m) => m.type === 'TB' || m.type === 'TW' || m.type === 'WALL')
  const above = marks.filter((m) => !below.includes(m))

  return (
    <svg class="board" viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`} role="img" aria-label="Go board">
      <defs>
        <radialGradient id="g-black" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#6b6b6b" />
          <stop offset="45%" stop-color="#1f1f1f" />
          <stop offset="100%" stop-color="#050505" />
        </radialGradient>
        <radialGradient id="g-white" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="70%" stop-color="#e9e9e4" />
          <stop offset="100%" stop-color="#bdbdb6" />
        </radialGradient>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0 0L10 5L0 10z" fill="currentColor" />
        </marker>
        <marker id="arrow-wide" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto">
          <path d="M0 0L10 5L0 10z" fill="currentColor" />
        </marker>
      </defs>
      <rect class="board-bg" x={x0 - 0.75} y={y0 - 0.75} width={x1 - x0 + 1.5} height={y1 - y0 + 1.5} rx=".12" />
      {below.map((m, i) => <MarkShape key={'b' + i} m={m} board={board} />)}
      {range(x0, x1).map((x) => (
        <line key={'v' + x} x1={x} y1={ys} x2={x} y2={ye} stroke="var(--board-line)" stroke-width={x === 0 || x === SIZE - 1 ? 0.06 : 0.03} />
      ))}
      {range(y0, y1).map((y) => (
        <line key={'h' + y} x1={xs} y1={y} x2={xe} y2={y} stroke="var(--board-line)" stroke-width={y === 0 || y === SIZE - 1 ? 0.06 : 0.03} />
      ))}
      {STAR.flatMap((a) => STAR.map((b) => [a, b] as Pt)).filter(inWin).map(([x, y]) => (
        <circle key={`s${x},${y}`} cx={x} cy={y} r=".1" fill="var(--board-line)" />
      ))}
      {coordinates && (
        <g font-size=".4" fill="var(--board-coord)" text-anchor="middle">
          {range(x0, x1).map((x) => [
            <text key={'ct' + x} x={x} y={y0 - 0.95}>{colName(x)}</text>,
            <text key={'cb' + x} x={x} y={y1 + 1.2}>{colName(x)}</text>,
          ])}
          {range(y0, y1).map((y) => [
            <text key={'cl' + y} x={x0 - 1} y={y + 0.14}>{SIZE - y}</text>,
            <text key={'cr' + y} x={x1 + 1} y={y + 0.14}>{SIZE - y}</text>,
          ])}
        </g>
      )}
      {range(y0, y1).flatMap((y) =>
        range(x0, x1).map((x) => {
          const s = board[y][x]
          if (!s) return null
          const n = numbers?.get(`${x},${y}`)
          return (
            <g key={`st${x},${y}`}>
              <circle class="stone-shadow" cx={x + 0.05} cy={y + 0.07} r=".47" />
              <circle class={s === 1 ? 'stone-b' : 'stone-w'} cx={x} cy={y} r=".47" />
              {n !== undefined && (
                <text x={x} y={y + 0.15} font-size=".4" text-anchor="middle" fill={s === 1 ? '#fff' : '#111'}>{n}</text>
              )}
            </g>
          )
        }),
      )}
      {last && !numbers && inWin(last) && board[last[1]][last[0]] !== 0 && (
        <circle cx={last[0]} cy={last[1]} r=".2" fill="none" stroke={board[last[1]][last[0]] === 1 ? '#fff' : '#111'} stroke-width=".06" />
      )}
      {onPoint &&
        range(y0, y1).flatMap((y) =>
          range(x0, x1).map((x) => (
            <rect key={`p${x},${y}`} class="hit" x={x - 0.5} y={y - 0.5} width="1" height="1" fill="transparent" onClick={() => onPoint([x, y])} />
          )),
        )}
      {(pending ?? []).filter(inWin).map(([x, y]) => (
        <circle key={`pd${x},${y}`} cx={x} cy={y} r=".36" fill="none" stroke="var(--markup)" stroke-width=".07" stroke-dasharray=".15 .1" pointer-events="none" />
      ))}
      {markers.filter((m) => inWin(m.pt)).map((m, i, all) => {
        const k = m.cat ? CATEGORIES[m.cat] : { color: '#888', symbol: '·', ink: '#fff', ring: false, label: 'Unclassified' }
        // Two markers on one point (Black and White both have a move there): put them side by side.
        const same = all.filter((o) => o.pt[0] === m.pt[0] && o.pt[1] === m.pt[1])
        const shift = same.length > 1 ? (same.indexOf(m) === 0 ? -0.22 : 0.22) : 0
        const x = m.pt[0] + shift, y = m.pt[1]
        if (m.showColor)
          return (
            <g key={`m${i}`} class="marker" onClick={m.onClick} role="button" aria-label={m.title}>
              <title>{m.title}</title>
              <circle cx={x} cy={y} r={same.length > 1 ? 0.24 : 0.3} fill={m.sign === 1 ? '#151515' : '#f5f5f2'} stroke={k.color} stroke-width={m.highlight ? 0.14 : 0.1} />
            </g>
          )
        return (
          <g key={`m${i}`} class="marker" onClick={m.onClick} role="button" aria-label={m.title}>
            <title>{m.title}</title>
            <circle cx={x} cy={y} r=".48" fill="transparent" />
            {m.variation ? (
              <>
                <circle cx={x} cy={y} r=".3" fill={`color-mix(in srgb, ${k.color} 22%, var(--board))`} stroke={k.color} stroke-width=".1" stroke-dasharray=".2 .13" />
                {m.highlight && <circle cx={x} cy={y} r=".42" fill="none" stroke="var(--fg)" stroke-width=".04" />}
              </>
            ) : k.ring ? (
              <circle cx={x} cy={y} r=".3" fill="var(--board)" stroke={k.color} stroke-width=".1" />
            ) : (
              <>
                <circle cx={x} cy={y} r={m.highlight ? 0.38 : 0.31} fill={k.color} stroke={m.highlight ? 'var(--fg)' : 'none'} stroke-width=".05" />
                <text x={x} y={y + 0.13} font-size=".34" text-anchor="middle" fill={k.ink}>{k.symbol}</text>
              </>
            )}
          </g>
        )
      })}
      {above.map((m, i) => <MarkShape key={'a' + i} m={m} board={board} />)}
    </svg>
  )
}
