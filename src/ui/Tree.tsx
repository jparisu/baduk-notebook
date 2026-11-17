/**
 * Tree of moves (docs/MODEL.md §6) with three modes and a zoom. The layout is always the one of the
 * whole tree, in a fixed order, so the tree never moves when you move through it (like OGS):
 * - linear:    shows the current line, before and ahead, plus the lines visited in this session (the trail);
 * - proximity: the same, plus the other moves from the current position;
 * - complete:  every move from the start of the line.
 * Hidden branches show a "+n" badge; "ahead" limits how far after the current move the tree goes.
 */
import { useLayoutEffect, useRef } from 'preact/hooks'
import { CATEGORIES, type Category } from '../core/fields'
import { apply, applySign, ptName, type Pt } from '../core/geometry'
import { candidates, frame, moveOf, type Candidate, type Ctx, type Step } from '../view'

export type TreeMode = 'linear' | 'proximity' | 'complete'

interface Placed {
  step: Step
  /** Line from the root to this node: selecting the node opens it. */
  line: Step[]
  parent: number
  x: number
  y: number
  cat: Category | null
  sign: number
  pass: boolean
  label: string
  extraDb: boolean
  transposition: boolean
  session: boolean
  tag: string | null
  more: boolean
  ahead: boolean // part of the line after the current move
  pt: Pt | null
  /** Folded in Design: number of moves hidden below. */
  folded: number
  /** Leads into another joseki: its name (drawn as a stub, not expanded). */
  stub: string | null
  /** The tree starts at a move (not at the start of the line). */
  rootMove: boolean
}

const DX = 34, DY = 30, OX = 18, OY = 24, MAX_NODES = 800

interface Props {
  ctx: Ctx
  /** Current line, from its start. */
  path: Step[]
  /** Moves after the current one on this line (stepped-back moves or the main line). */
  forward: Step[]
  mode: TreeMode
  zoom: number
  defaultDb: string
  onSelect: (line: Step[]) => void
  /** Session moves (not in the databases) that continue the line given by these keys. */
  extra?: (keys: string[]) => Step[]
  /** Other lines visited in this session (the trail), each from the same first position as `path`. */
  trail?: Step[][]
  /** Short name of the label that starts at a position, if any. */
  tagOf?: (key: string) => string | null
  /** Hidden branches (view only), and whether to show them anyway. The current line is never hidden. */
  folded?: Set<string>
  showFolded?: boolean
  /** Right-click / long-press on a node. */
  onContext?: (line: Step[], x: number, y: number) => void
  /** Text inside the stones: move number (default) or coordinate. */
  labels?: 'number' | 'coord'
  /** Number of the first move drawn (when the tree starts at a move). */
  first?: number
  /** The step before the root, when the tree starts at a move: the root is drawn as that move. */
  rootParent?: Step
  /** How many moves after the current one are drawn (all when undefined). */
  ahead?: number
  /** Complete mode: only children for which this is true are drawn (the current line always is). */
  keepChild?: (parent: Step, child: Step) => boolean
}

export function Tree(props: Props) {
  const { ctx, path, mode } = props
  const svgRef = useRef<SVGSVGElement>(null)
  // Scroll only when the current move would leave the box: the tree itself never moves.
  useLayoutEffect(() => {
    const svg = svgRef.current
    const box = svg?.parentElement
    const el = svg?.querySelector('.tree-node.cur')
    if (!box || !el) return
    // When it leaves the box, bring it back with room around it: a third from the left, in the middle vertically.
    const b = box.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 16
    if (r.left < b.left + pad || r.right > b.right - pad) box.scrollLeft += r.left - b.left - b.width / 3
    if (r.top < b.top + pad || r.bottom > b.bottom - pad) box.scrollTop += r.top - b.top - b.height / 2 + r.height / 2
  })

  /** Category, color and label of the move from `parent` to `child`. */
  const describe = (parent: Step, child: Step, cands?: Candidate[]) => {
    const c = (cands ?? candidates(ctx, parent)).find((x) => x.step.key === child.key && (!child.edge || x.edge === child.edge))
    const m = moveOf(child)
    const sign = c ? c.sign : m ? applySign(frame(ctx, parent), m.sign) : 0
    const pt = m ? (m.pt ? apply(frame(ctx, parent), m.pt) : null) : c ? c.pt : null
    const session = !c
    const label = session
      ? `${sign === 1 ? 'Black' : 'White'} ${pt ? ptName(pt) : 'tenuki'} — your move, not in the databases`
      : `${sign === 1 ? 'Black' : 'White'} ${pt ? ptName(pt) : 'tenuki'}${c!.cat ? ' — ' + CATEGORIES[c!.cat].label : ''}${c!.dbs.some((d) => d !== props.defaultDb) ? ` (${c!.dbs.join(', ')})` : ''}`
    return { cat: c?.cat ?? null, sign, pass: m ? !m.pt : false, session, label, extraDb: !!c && !c.dbs.includes(props.defaultDb), pt }
  }

  const placed: Placed[] = []
  const kids: number[][] = []
  const add = (p: Omit<Placed, 'tag' | 'more' | 'transposition' | 'ahead' | 'folded' | 'stub' | 'rootMove' | 'x' | 'y'> & Partial<Placed>) => {
    kids.push([])
    const i = placed.push({ tag: props.tagOf?.(p.step.key) ?? null, more: false, transposition: false, ahead: false, folded: 0, stub: null, rootMove: false, x: p.line.length - 1, y: 0, ...p }) - 1
    if (p.parent >= 0) kids[p.parent].push(i)
    return i
  }
  const root = path[0]
  if (props.rootParent && moveOf(root)) {
    const d = describe(props.rootParent, root)
    add({ step: root, line: [root], parent: -1, ...d, label: `Tree start · ${d.label}`, rootMove: true })
  } else {
    add({ step: root, line: [root], parent: -1, cat: null, sign: 0, pass: false, label: 'Start of the line', extraDb: false, session: false, pt: null })
  }
  /** Children of a position: database moves, then session moves. */
  const childrenOf = (line: Step[]) => {
    const step = line[line.length - 1]
    const cands = candidates(ctx, step)
    const known = new Set(cands.map((c) => c.step.key))
    const extra = (props.extra?.(line.map((s) => s.key)) ?? []).filter((s) => !known.has(s.key))
    return { cands, list: [...cands.map((c) => c.step), ...extra] }
  }
  /** Moves below a position (capped), for the badge of a hidden branch. */
  const countBelow = (line: Step[], seen = new Set<string>()): number => {
    let n = 0
    for (const k of childrenOf(line).list) {
      if (seen.has(k.key) || n > 200) continue
      seen.add(k.key)
      n += 1 + countBelow([...line, k], seen)
    }
    return n
  }
  const onPath = (line: Step[]) => line.length <= path.length && line.every((s, i) => s.key === path[i].key)
  const limit = props.ahead === undefined ? Infinity : path.length - 1 + props.ahead
  const hidden = (line: Step[]) => !props.showFolded && !!props.folded?.has(line[line.length - 1].key) && !onPath(line)

  // 1. The whole tree, in a fixed order (database moves best first, then your own moves). Every mode
  //    uses this same layout, so moving around never reorders the rows; Linear and Proximity only hide nodes.
  const seen = new Set([root.key])
  const grow = (i: number) => {
    const line = placed[i].line
    const { cands, list } = childrenOf(line)
    const shown = list.filter((c) => !props.keepChild || onPath([...line, c]) || props.keepChild(line[line.length - 1], c))
    for (const child of shown) {
      if (placed.length > MAX_NODES) return
      const transposition = seen.has(child.key)
      seen.add(child.key)
      const cl = [...line, child]
      const j = add({ step: child, line: cl, parent: i, ...describe(line[line.length - 1], child, cands), transposition })
      if (transposition) continue
      if (hidden(cl)) {
        placed[j].folded = countBelow(cl)
        continue
      }
      grow(j)
    }
  }
  grow(0)

  // 2. Lines that must be drawn even where the full tree stops (a transposition, the size cap):
  //    the current line and what is ahead, and the lines visited in this session (the trail).
  const main = [...path, ...props.forward]
  const lines: Step[][] = [main, ...(props.trail ?? [])].filter((l) => l[0]?.key === root.key)
  const visible = new Set<number>([0])
  const follow = (line: Step[], isMain: boolean) => {
    let i = 0
    for (let d = 1; d < line.length; d++) {
      let j = kids[i].find((k) => placed[k].step.key === line[d].key)
      if (j === undefined) {
        if (placed[i].folded) return
        j = add({ step: line[d], line: line.slice(0, d + 1), parent: i, ...describe(line[d - 1], line[d]) })
      }
      placed[i].transposition = false
      if (isMain && placed[j].step !== line[d]) {
        // The current line's own steps: a move may have been played mirrored; show it as played.
        Object.assign(placed[j], { step: line[d], line: line.slice(0, d + 1), ...describe(line[d - 1], line[d]) })
      }
      if (isMain && d >= path.length) placed[j].ahead = true
      visible.add(j)
      if (placed[j].folded) return
      i = j
    }
  }
  lines.forEach((l, k) => follow(l, k === 0))
  // The current move.
  let cur = 0
  for (let d = 1; d < path.length; d++) {
    const next = kids[cur].find((k) => placed[k].step.key === path[d].key)
    if (next === undefined) break
    cur = next
  }

  // 3. Layout of the whole tree: each node one column right of its parent; the first child stays on its parent's row.
  let row = 0
  const lay = (i: number, y: number) => {
    placed[i].y = y
    kids[i].forEach((k, n) => lay(k, n === 0 ? y : ++row))
  }
  lay(0, 0)

  // 4. What each mode shows: Complete everything, Linear the lines, Proximity also the moves from here.
  if (mode === 'complete') placed.forEach((_, i) => visible.add(i))
  if (mode === 'proximity') kids[cur].forEach((k) => visible.add(k))
  const show = placed.map((p, i) => visible.has(i) && p.line.length - 1 <= Math.max(limit, path.length - 1))
  // Leaves that hide more moves get a "›".
  placed.forEach((p, i) => {
    if (show[i] && !p.folded) p.more = kids[i].some((k) => !show[k]) || (!kids[i].length && i > 0 && !p.transposition && childrenOf(p.line).list.length > 0 && placed.length > MAX_NODES)
  })
  // Hidden rows keep their place (nothing moves); only the empty space below the last visible row is cut.
  const rows = Math.max(...placed.filter((_, i) => show[i]).map((p) => p.y)) + 1

  const select = (i: number) => props.onSelect(placed[i].line)
  const onLine = new Set<number>()
  for (let i = cur; i >= 0; i = placed[i].parent) onLine.add(i)

  const maxX = Math.max(...placed.filter((_, i) => show[i]).map((p) => p.x))
  const W = (maxX + 1) * DX + 24 + (placed[0].rootMove ? 24 : 0), H = rows * DY + 14
  const shiftX = placed[0].rootMove && (props.first ?? 0) > 1 ? 24 : 0
  const pos = (p: Placed) => [OX + shiftX + p.x * DX, OY + p.y * DY]

  return (
    <svg ref={svgRef} width={W * props.zoom} height={H * props.zoom} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tree of moves (${mode})`}>
      {placed.map((p, i) => {
        if (p.parent < 0 || !show[i]) return null
        const [x1, y1] = pos(placed[p.parent]), [x2, y2] = pos(p)
        const strong = onLine.has(i) && !p.ahead && i <= cur
        return (
          <path
            key={'e' + i}
            d={`M${x1} ${y1} L${x1 + DX / 2} ${y2} L${x2} ${y2}`}
            fill="none"
            stroke={strong ? 'var(--fg)' : 'var(--tree-line)'}
            stroke-width={strong ? 2.4 : 1.6}
            stroke-dasharray={p.ahead ? '4 3' : undefined}
          />
        )
      })}
      {placed.map((p, i) => {
        if (!show[i]) return null
        const [x, y] = pos(p)
        const k = p.cat ? CATEGORIES[p.cat] : null
        const ring = p.session ? 'var(--markup)' : k?.color ?? 'var(--muted)'
        const fill = p.sign === 1 ? '#151515' : '#f5f5f2'
        const ink = p.sign === 1 ? '#fff' : '#111'
        const dashed = p.session // dashed means only one thing: not stored in a database
        return (
          <g
            key={'n' + i}
            class={`tree-node ${i === cur ? 'cur' : ''} ${p.ahead ? 'ahead' : ''}`}
            data-key={p.step.key}
            onClick={() => select(i)}
            onContextMenu={(e) => {
              if (!props.onContext) return
              e.preventDefault()
              props.onContext(p.line, e.clientX, e.clientY)
            }}
            role="button"
            aria-label={p.label}
          >
            <title>{p.label}{p.tag ? ` — start of ${p.tag}` : ''}</title>
            {i === cur && <rect x={x - 14} y={y - 14} width="28" height="28" rx="5" fill="none" stroke="var(--accent)" stroke-width="2.4" />}
            {p.parent < 0 && !p.rootMove ? (
              <rect x={x - 8} y={y - 8} width="16" height="16" rx="3" fill="var(--chip)" stroke="var(--muted)" />
            ) : p.pass ? (
              <>
                <rect x={x - 9} y={y - 9} width="18" height="18" rx="3" fill={fill} stroke={ring} stroke-width="3" />
                <text x={x} y={y + 4} font-size="10" text-anchor="middle" fill={ink}>T</text>
              </>
            ) : (
              <>
                <circle cx={x} cy={y} r="9" fill={fill} stroke={ring} stroke-width="3" stroke-dasharray={dashed ? '3 2' : undefined} />
                <text x={x} y={y + 3.5} font-size={props.labels === 'coord' ? 7.5 : 9} text-anchor="middle" fill={ink}>
                  {p.transposition ? '⇄' : props.labels === 'coord' && p.pt ? ptName(p.pt) : (props.first ?? 0) + p.line.length - 1}
                </text>
              </>
            )}
            {p.extraDb && <circle cx={x + 9} cy={y - 9} r="3.5" fill="var(--db-extra)" />}
            {p.rootMove && (props.first ?? 0) > 1 && (
              <g class="before-badge">
                <rect x={x - 34} y={y - 7} width="20" height="14" rx="7" fill="var(--chip)" stroke="var(--muted)" />
                <text x={x - 24} y={y + 3.5} font-size="8" text-anchor="middle" fill="var(--chip-fg)">⋯{(props.first ?? 0) - 1}</text>
              </g>
            )}
            {p.stub && (
              <text x={x + 14} y={y + 3.5} font-size="9" fill="var(--accent)" font-weight="700">→ {p.stub.length > 28 ? p.stub.slice(0, 27) + '…' : p.stub}</text>
            )}
            {p.more && !p.folded && !p.stub && <text x={x + 13} y={y + 4} font-size="12" fill="var(--muted)" aria-hidden>›</text>}
            {p.folded > 0 && (
              <g class="fold-badge">
                <rect x={x + 12} y={y - 7} width={p.folded > 9 ? 26 : 20} height="14" rx="7" fill="var(--chip)" stroke="var(--muted)" />
                <text x={x + 12 + (p.folded > 9 ? 13 : 10)} y={y + 3.5} font-size="9" text-anchor="middle" fill="var(--chip-fg)">+{p.folded}</text>
              </g>
            )}
            {p.tag && (
              <g class="tree-tag">
                <path d={`M${x - 3} ${y - 11} L${x - 3} ${y - 21}`} stroke="var(--accent)" stroke-width="1.5" />
                <path d={`M${x - 3} ${y - 21} L${x + 5} ${y - 18} L${x - 3} ${y - 15} Z`} fill="var(--accent)" />
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
