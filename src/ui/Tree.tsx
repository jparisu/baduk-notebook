/**
 * Tree of moves (SPEC §8.6) with three modes and a zoom:
 * - linear:    the current line, before and ahead, in one row;
 * - proximity: the line plus the other options after the current move (without their continuations);
 * - complete:  the whole tree from the start of the line.
 */
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
  /** Short name of the label that starts at a position, if any. */
  tagOf?: (key: string) => string | null
  /** Design tab: positions whose branch is folded (view only), and whether to show them anyway. */
  folded?: Set<string>
  showFolded?: boolean
  /** Design tab: right-click / long-press on a node. */
  onContext?: (line: Step[], x: number, y: number) => void
  /** Text inside the stones: move number (default) or coordinate. */
  labels?: 'number' | 'coord'
  /** Number of the first move drawn (when the tree starts at the selection). */
  first?: number
  /** The step before the root, when the tree starts at a move: the root is drawn as that move. */
  rootParent?: Step
  /** Complete mode: name of the joseki a position starts, when the tree must stop there (another joseki). */
  stopAt?: (key: string) => string | null
  /** Complete mode: how many moves below the root are drawn. */
  maxDepth?: number
}

export function Tree(props: Props) {
  const { ctx, path, mode } = props

  /** Category, color and label of the move from `parent` to `child`. */
  const describe = (parent: Step, child: Step, cands?: Candidate[]) => {
    const c = (cands ?? candidates(ctx, parent)).find((x) => x.step.key === child.key && (!child.edge || x.edge === child.edge))
    const m = moveOf(child)
    const sign = c ? c.sign : m ? applySign(frame(ctx, parent), m.sign) : 0
    const pt = c ? c.pt : m?.pt ? apply(frame(ctx, parent), m.pt) : null
    const session = !c
    const label = session
      ? 'Your move — not in the databases'
      : `${sign === 1 ? 'Black' : 'White'} ${pt ? ptName(pt) : 'tenuki'}${c!.cat ? ' — ' + CATEGORIES[c!.cat].label : ''}${c!.dbs.some((d) => d !== props.defaultDb) ? ` (${c!.dbs.join(', ')})` : ''}`
    return { cat: c?.cat ?? null, sign, pass: m ? !m.pt : false, session, label, extraDb: !!c && !c.dbs.includes(props.defaultDb), pt }
  }

  const placed: Placed[] = []
  const add = (p: Omit<Placed, 'tag' | 'more' | 'transposition' | 'ahead' | 'folded' | 'stub' | 'rootMove'> & Partial<Placed>) =>
    placed.push({ tag: props.tagOf?.(p.step.key) ?? null, more: false, transposition: false, ahead: false, folded: 0, stub: null, rootMove: false, ...p }) - 1
  const root = path[0]
  if (props.rootParent && moveOf(root)) {
    const d = describe(props.rootParent, root)
    add({ step: root, line: [root], parent: -1, x: 0, y: 0, ...d, label: `Tree start · ${d.label}`, rootMove: true })
  } else {
    add({ step: root, line: [root], parent: -1, x: 0, y: 0, cat: null, sign: 0, pass: false, label: 'Start of the line', extraDb: false, session: false, pt: null })
  }
  /** Moves below a position (capped), for the badge of a folded branch. */
  const countBelow = (step: Step, base: Step[], seen = new Set<string>()): number => {
    let n = 0
    const known = candidates(ctx, step)
    const kids = [...known.map((c) => c.step), ...(props.extra?.([...base.map((s) => s.key)]) ?? []).filter((s) => !known.some((c) => c.step.key === s.key))]
    for (const k of kids) {
      if (seen.has(k.key) || n > 200) continue
      seen.add(k.key)
      n += 1 + countBelow(k, [...base, k], seen)
    }
    return n
  }
  let cur = 0
  let rows = 1

  if (mode === 'complete') {
    const seen = new Set([root.key])
    let row = 0
    const keysOf = (i: number) => placed[i].line.map((s) => s.key)
    const place = (i: number, depth: number, r: number) => {
      const cands = candidates(ctx, placed[i].step)
      const known = new Set(cands.map((c) => c.step.key))
      const extra = (props.extra?.(keysOf(i)) ?? []).filter((s) => !known.has(s.key))
      const kids = [...cands.map((c) => c.step), ...extra]
      if (props.maxDepth !== undefined && depth >= props.maxDepth) {
        placed[i].more = kids.length > 0
        return
      }
      kids.forEach((child, k) => {
        if (placed.length > MAX_NODES) return
        const y = k === 0 ? r : ++row
        const transposition = seen.has(child.key)
        seen.add(child.key)
        const d = describe(placed[i].step, child, cands)
        const j = add({ step: child, line: [...placed[i].line, child], parent: i, x: depth + 1, y, ...d, transposition })
        if (transposition) return
        const other = props.stopAt?.(child.key)
        if (other) {
          placed[j].stub = other
          return
        }
        if (props.folded?.has(child.key) && !props.showFolded) {
          placed[j].folded = countBelow(child, placed[j].line)
          return
        }
        place(j, depth + 1, y)
      })
    }
    place(0, 0, 0)
    rows = row + 1
    // The current move: follow the line through the placed nodes.
    for (let d = 1; d < path.length; d++) {
      const next = placed.findIndex((p) => p.parent === cur && p.step.key === path[d].key)
      if (next < 0) break
      cur = next
    }
  } else {
    // The line: moves before the current one, the current one, and the moves ahead.
    const line = [...path, ...props.forward]
    let prev = 0
    for (let i = 1; i < line.length; i++) {
      const d = describe(line[i - 1], line[i])
      prev = add({ step: line[i], line: line.slice(0, i + 1), parent: prev, x: i, y: 0, ...d, ahead: i >= path.length })
    }
    cur = path.length - 1
    // Has the last node of the line more moves?
    const last = placed[placed.length - 1]
    last.more = candidates(ctx, last.step).length > 0

    if (mode === 'proximity') {
      const branch = (parentIdx: number, parentStep: Step, base: Step[], skipKey: string | null, x: number) => {
        const cands = candidates(ctx, parentStep)
        const known = new Set(cands.map((c) => c.step.key))
        const extra = (props.extra?.(base.map((s) => s.key)) ?? []).filter((s) => !known.has(s.key))
        let y = 1
        for (const child of [...cands.map((c) => c.step), ...extra]) {
          if (child.key === skipKey) continue
          const d = describe(parentStep, child, cands)
          const j = add({ step: child, line: [...base, child], parent: parentIdx, x, y: y++, ...d })
          placed[j].more = candidates(ctx, child).length > 0
        }
        rows = Math.max(rows, y)
      }
      // Only the other options after the current move; not the alternatives at its own depth.
      branch(cur, path[path.length - 1], path, props.forward[0]?.key ?? null, cur + 1)
    }
  }

  const select = (i: number) => props.onSelect(placed[i].line)
  const onLine = new Set<number>()
  if (mode === 'complete') for (let i = cur; i >= 0; i = placed[i].parent) onLine.add(i)
  else placed.forEach((p, i) => p.y === 0 && onLine.add(i))

  const maxX = Math.max(...placed.map((p) => p.x))
  const W = (maxX + 1) * DX + 24 + (placed.some((p) => p.stub) ? 170 : 0) + (placed[0].rootMove ? 24 : 0), H = rows * DY + 14
  const shiftX = placed[0].rootMove && (props.first ?? 0) > 1 ? 24 : 0
  const pos = (p: Placed) => [OX + shiftX + p.x * DX, OY + p.y * DY]

  return (
    <svg width={W * props.zoom} height={H * props.zoom} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tree of moves (${mode})`}>
      {placed.map((p, i) => {
        if (p.parent < 0) return null
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
        const [x, y] = pos(p)
        const k = p.cat ? CATEGORIES[p.cat] : null
        const ring = p.session ? 'var(--markup)' : k?.color ?? 'var(--muted)'
        const fill = p.sign === 1 ? '#151515' : '#f5f5f2'
        const ink = p.sign === 1 ? '#fff' : '#111'
        const dashed = p.transposition || p.session || !!p.stub || (p.tag && !p.pass && p.parent >= 0)
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
