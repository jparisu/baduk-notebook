/** Variation tree (SPEC §8.6): main line along the top, branches below. */
import { CATEGORIES, type Category } from '../core/fields'
import { ptName } from '../core/geometry'
import { candidates, type Ctx, type Step } from '../view'

interface Placed {
  step: Step
  parent: number
  x: number
  y: number
  cat: Category | null
  sign: number
  pass: boolean
  label: string
  extraDb: boolean
  transposition: boolean
}

const DX = 38, DY = 30, OX = 18, OY = 18, MAX_NODES = 600

export function Tree(props: { ctx: Ctx; root: Step; path: Step[]; defaultDb: string; onSelect: (path: Step[]) => void }) {
  const { ctx, root, path } = props
  const placed: Placed[] = [{ step: root, parent: -1, x: 0, y: 0, cat: null, sign: 0, pass: false, label: 'Start', extraDb: false, transposition: false }]
  const seen = new Set([root.key])
  let row = 0
  const place = (i: number, depth: number, r: number) => {
    candidates(ctx, placed[i].step).forEach((c, k) => {
      if (placed.length > MAX_NODES) return
      const y = k === 0 ? r : ++row
      const transposition = seen.has(c.step.key)
      seen.add(c.step.key)
      placed.push({
        step: c.step,
        parent: i,
        x: depth + 1,
        y,
        cat: c.cat,
        sign: c.sign,
        pass: !c.pt,
        label: `${c.sign === 1 ? 'Black' : 'White'} ${c.pt ? ptName(c.pt) : 'tenuki'}${c.cat ? ' — ' + CATEGORIES[c.cat].label : ''}${c.dbs.some((d) => d !== props.defaultDb) ? ` (${c.dbs.join(', ')})` : ''}${transposition ? ' — joins a position shown elsewhere' : ''}`,
        extraDb: !c.dbs.includes(props.defaultDb),
        transposition,
      })
      if (!transposition) place(placed.length - 1, depth + 1, y)
    })
  }
  place(0, 0, 0)

  const onPath = new Set<number>()
  // Find the placed node that matches the current path (same sequence of keys).
  let cur = 0
  for (let d = 1; d < path.length; d++) {
    const next = placed.findIndex((p) => p.parent === cur && p.step.key === path[d].key)
    if (next < 0) break
    cur = next
  }
  for (let i = cur; i >= 0; i = placed[i].parent) onPath.add(i)

  const select = (i: number) => {
    const chain: Step[] = []
    for (let j = i; j >= 0; j = placed[j].parent) chain.unshift(placed[j].step)
    props.onSelect(chain)
  }
  const maxX = Math.max(...placed.map((p) => p.x))
  const pos = (p: Placed) => [OX + p.x * DX, OY + p.y * DY]

  return (
    <svg width={(maxX + 1) * DX + 20} height={(row + 1) * DY + 12} role="img" aria-label="Variation tree">
      {placed.map((p, i) => {
        if (p.parent < 0) return null
        const [x1, y1] = pos(placed[p.parent]), [x2, y2] = pos(p)
        const on = onPath.has(i)
        return <path key={'e' + i} d={`M${x1} ${y1} L${x1 + DX / 2} ${y2} L${x2} ${y2}`} fill="none" stroke={on ? 'var(--fg)' : 'var(--line)'} stroke-width={on ? 2.2 : 1.4} />
      })}
      {placed.map((p, i) => {
        const [x, y] = pos(p)
        const k = p.cat ? CATEGORIES[p.cat] : null
        const ring = k?.color ?? 'var(--muted)'
        const fill = p.sign === 1 ? 'var(--stone-black)' : 'var(--stone-white)'
        const ink = p.sign === 1 ? '#fff' : '#111'
        return (
          <g key={'n' + i} class="tree-node" onClick={() => select(i)} role="button" aria-label={p.label}>
            <title>{p.label}</title>
            {i === cur && <rect x={x - 14} y={y - 14} width="28" height="28" rx="4" fill="none" stroke="var(--accent)" stroke-width="2" />}
            {p.parent < 0 ? (
              <rect x={x - 8} y={y - 8} width="16" height="16" fill="var(--chip)" stroke="var(--muted)" />
            ) : p.pass ? (
              <>
                <rect x={x - 9} y={y - 9} width="18" height="18" rx="3" fill={fill} stroke={ring} stroke-width="3" />
                <text x={x} y={y + 4} font-size="10" text-anchor="middle" fill={ink}>T</text>
              </>
            ) : (
              <>
                <circle cx={x} cy={y} r="9" fill={fill} stroke={ring} stroke-width="3" stroke-dasharray={p.transposition ? '3 2' : undefined} />
                <text x={x} y={y + 3.5} font-size="9" text-anchor="middle" fill={ink}>{p.transposition ? '⇄' : p.x}</text>
              </>
            )}
            {p.extraDb && <circle cx={x + 9} cy={y - 9} r="3.5" fill="var(--db-extra)" />}
          </g>
        )
      })}
    </svg>
  )
}
