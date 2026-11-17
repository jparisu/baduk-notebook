/**
 * Tree of moves (SPEC §8.6) with three modes and a zoom:
 * - linear:    the current line, before and ahead, in one row;
 * - proximity: the line plus the neighbours of the current move (its alternatives and the options after it);
 * - complete:  the whole tree from the start of the line.
 */
import { CATEGORIES, type Category } from '../core/fields'
import { applySign, ptName } from '../core/geometry'
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
}

export function Tree(props: Props) {
  const { ctx, path, mode } = props

  /** Category, color and label of the move from `parent` to `child`. */
  const describe = (parent: Step, child: Step, cands?: Candidate[]) => {
    const c = (cands ?? candidates(ctx, parent)).find((x) => x.step.key === child.key && (!child.edge || x.edge === child.edge))
    const m = moveOf(child)
    const sign = c ? c.sign : m ? applySign(frame(ctx, parent), m.sign) : 0
    const pt = c ? c.pt : null
    const session = !c
    const label = session
      ? 'Your move — not in the databases'
      : `${sign === 1 ? 'Black' : 'White'} ${pt ? ptName(pt) : 'tenuki'}${c!.cat ? ' — ' + CATEGORIES[c!.cat].label : ''}${c!.dbs.some((d) => d !== props.defaultDb) ? ` (${c!.dbs.join(', ')})` : ''}`
    return { cat: c?.cat ?? null, sign, pass: m ? !m.pt : false, session, label, extraDb: !!c && !c.dbs.includes(props.defaultDb) }
  }

  const placed: Placed[] = []
  const add = (p: Omit<Placed, 'tag' | 'more' | 'transposition' | 'ahead'> & Partial<Placed>) =>
    placed.push({ tag: props.tagOf?.(p.step.key) ?? null, more: false, transposition: false, ahead: false, ...p }) - 1
  const root = path[0]
  add({ step: root, line: [root], parent: -1, x: 0, y: 0, cat: null, sign: 0, pass: false, label: 'Start of the line', extraDb: false, session: false })
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
      kids.forEach((child, k) => {
        if (placed.length > MAX_NODES) return
        const y = k === 0 ? r : ++row
        const transposition = seen.has(child.key)
        seen.add(child.key)
        const d = describe(placed[i].step, child, cands)
        const j = add({ step: child, line: [...placed[i].line, child], parent: i, x: depth + 1, y, ...d, transposition })
        if (!transposition) place(j, depth + 1, y)
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
      // Alternatives to the current move (siblings), one column; options after it (children), next column.
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
      if (path.length > 1) branch(cur - 1, path[path.length - 2], path.slice(0, -1), path[path.length - 1].key, cur)
      branch(cur, path[path.length - 1], path, props.forward[0]?.key ?? null, cur + 1)
    }
  }

  const select = (i: number) => props.onSelect(placed[i].line)
  const onLine = new Set<number>()
  if (mode === 'complete') for (let i = cur; i >= 0; i = placed[i].parent) onLine.add(i)
  else placed.forEach((p, i) => p.y === 0 && onLine.add(i))

  const maxX = Math.max(...placed.map((p) => p.x))
  const W = (maxX + 1) * DX + 24, H = rows * DY + 14
  const pos = (p: Placed) => [OX + p.x * DX, OY + p.y * DY]

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
        const dashed = p.transposition || p.session || (p.tag && !p.pass && p.parent >= 0)
        return (
          <g key={'n' + i} class={`tree-node ${i === cur ? 'cur' : ''} ${p.ahead ? 'ahead' : ''}`} onClick={() => select(i)} role="button" aria-label={p.label}>
            <title>{p.label}{p.tag ? ` — start of ${p.tag}` : ''}</title>
            {i === cur && <rect x={x - 14} y={y - 14} width="28" height="28" rx="5" fill="none" stroke="var(--accent)" stroke-width="2.4" />}
            {p.parent < 0 ? (
              <rect x={x - 8} y={y - 8} width="16" height="16" rx="3" fill="var(--chip)" stroke="var(--muted)" />
            ) : p.pass ? (
              <>
                <rect x={x - 9} y={y - 9} width="18" height="18" rx="3" fill={fill} stroke={ring} stroke-width="3" />
                <text x={x} y={y + 4} font-size="10" text-anchor="middle" fill={ink}>T</text>
              </>
            ) : (
              <>
                <circle cx={x} cy={y} r="9" fill={fill} stroke={ring} stroke-width="3" stroke-dasharray={dashed ? '3 2' : undefined} />
                <text x={x} y={y + 3.5} font-size="9" text-anchor="middle" fill={ink}>{p.transposition ? '⇄' : p.line.length - 1}</text>
              </>
            )}
            {p.extraDb && <circle cx={x + 9} cy={y - 9} r="3.5" fill="var(--db-extra)" />}
            {p.more && <text x={x + 13} y={y + 4} font-size="12" fill="var(--muted)" aria-hidden>›</text>}
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
