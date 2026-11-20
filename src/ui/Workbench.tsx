/**
 * Fixed-size panels, like an editor's side bars: sizes depend only on the window, the zoom and what
 * you set by dragging; never on the content, which scrolls inside each panel.
 * - Workbench: columns separated by vertical bars. Drag a bar to resize the column next to it; its
 *   button collapses or reopens the column.
 * - Stack: panels in a column. Each has a share of the column's height; a header collapses it, the
 *   thin bar between two panels resizes them.
 * Sizes and collapsed states are remembered per browser.
 */
import type { ComponentChildren } from 'preact'
import { useRef, useState } from 'preact/hooks'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-preact'
import { storageKey } from '../storage'

function load<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(storageKey(key)) ?? '{}') }
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

/** Drags with the pointer; `move` gets the distance from where the drag started. */
function drag(e: PointerEvent, axis: 'x' | 'y', move: (d: number) => void) {
  e.preventDefault()
  const start = axis === 'x' ? e.clientX : e.clientY
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture?.(e.pointerId)
  document.body.classList.add(axis === 'x' ? 'dragging-x' : 'dragging-y')
  const onMove = (ev: PointerEvent) => move((axis === 'x' ? ev.clientX : ev.clientY) - start)
  const onUp = () => {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    document.body.classList.remove('dragging-x', 'dragging-y')
  }
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
}

export interface Column {
  id: string
  /** Name used in the bar's buttons ("Hide left panel"). Omit for the column that takes the remaining width. */
  name?: string
  /** Shown vertically on the bar while the column is collapsed. */
  label?: string
  width?: number
  min?: number
  max?: number
  class?: string
  node: ComponentChildren
}

/**
 * Columns: the one without `width` takes the rest of the row; the others keep their width.
 * On a phone the columns are simply shown one after another.
 */
export function Workbench({ id, cols, phone, class: cls }: { id: string; cols: Column[]; phone?: boolean; class?: string }) {
  const key = `baduk-notebook.wb.${id}`
  const defaults = Object.fromEntries(cols.filter((c) => c.width).map((c) => [c.id, c.width!]))
  const [widths, setWidths] = useState<Record<string, number>>(() => load(key + '.w', defaults))
  const [closed, setClosed] = useState<Record<string, boolean>>(() => load(key + '.c', {}))
  if (phone) return <>{cols.map((c) => c.node)}</>

  const flexIdx = cols.findIndex((c) => !c.width)
  const toggle = (c: Column) => {
    const next = { ...closed, [c.id]: !closed[c.id] }
    setClosed(next)
    save(key + '.c', next)
  }
  const template: string[] = []
  const parts: ComponentChildren[] = []
  cols.forEach((c, i) => {
    const fixed = !!c.width
    const shut = fixed && closed[c.id]
    template.push(fixed ? (shut ? '0px' : `${widths[c.id] ?? c.width}px`) : 'minmax(0, 1fr)')
    parts.push(
      <div key={c.id} class={`wb-col ${c.class ?? ''} ${shut ? 'shut' : ''}`} data-col={c.id}>
        {!shut && c.node}
      </div>,
    )
    if (i === cols.length - 1) return
    // The bar belongs to the fixed column next to it (left of the flexible one, or right of it).
    const owner = i < flexIdx ? c : cols[i + 1]
    const sign = i < flexIdx ? 1 : -1
    const ownerShut = !!closed[owner.id]
    template.push('12px')
    parts.push(
      <div key={'bar' + i} class={`wb-bar ${ownerShut ? 'shut' : ''}`} role="separator" aria-orientation="vertical" title={ownerShut ? '' : 'Drag to resize'}
        onPointerDown={(e) => {
          if (ownerShut || (e.target as HTMLElement).closest('button')) return
          const startW = widths[owner.id] ?? owner.width!
          drag(e as unknown as PointerEvent, 'x', (d) => {
            const w = Math.round(Math.min(owner.max ?? 700, Math.max(owner.min ?? 200, startW + sign * d)))
            setWidths((cur) => {
              const next = { ...cur, [owner.id]: w }
              save(key + '.w', next)
              return next
            })
          })
        }}
      >
        <button class="wb-toggle" onClick={() => toggle(owner)} aria-label={`${ownerShut ? 'Show' : 'Hide'} ${owner.name ?? owner.id} panel`} title={`${ownerShut ? 'Show' : 'Hide'} ${owner.name ?? owner.id} panel`}>
          {(sign === 1) === ownerShut ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
        {ownerShut && owner.label && <span class="wb-label" onClick={() => toggle(owner)}>{owner.label}</span>}
      </div>,
    )
  })
  return (
    <div class={`workbench ${cls ?? ''}`} style={{ gridTemplateColumns: template.join(' ') }}>
      {parts}
    </div>
  )
}

export interface StackItem {
  id: string
  title: ComponentChildren
  icon?: ComponentChildren
  class?: string
  style?: Record<string, string>
  /** Share of the column's height (default 1). */
  weight?: number
  body: ComponentChildren
}

const FOLDS = 'baduk-notebook.folds.v1'

/** Panels stacked in a column, each with a fixed share of the height. */
export function Stack({ id, items, head }: { id: string; items: StackItem[]; head?: ComponentChildren }) {
  const key = `baduk-notebook.stack.${id}`
  const [weights, setWeights] = useState<Record<string, number>>(() => load(key, {}))
  const [folds, setFolds] = useState<Record<string, boolean>>(() => load(FOLDS, {}))
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const isOpen = (it: StackItem) => folds[it.id] ?? true
  const weight = (it: StackItem) => weights[it.id] ?? it.weight ?? 1
  const toggle = (it: StackItem) => {
    const next = { ...load<Record<string, boolean>>(FOLDS, {}), [it.id]: !isOpen(it) }
    setFolds(next)
    save(FOLDS, next)
  }
  const open = items.filter(isOpen)
  return (
    <div class="stack">
      {head && <div class="stack-head">{head}</div>}
      {items.map((it) => {
        const o = isOpen(it)
        const k = open.indexOf(it)
        const below = k >= 0 && k < open.length - 1 ? open[k + 1] : null
        return [
          <section key={it.id} ref={(el) => { refs.current[it.id] = el }} class={`card stack-item ${it.class ?? ''} ${o ? '' : 'closed'}`} style={{ ...it.style, flex: o ? `${weight(it)} 1 0px` : '0 0 auto' }} data-card={it.id}>
            <button class="card-head" aria-expanded={o} onClick={() => toggle(it)}>
              {it.icon}
              <span class="card-title">{it.title}</span>
              <ChevronDown class="chev" size={16} aria-hidden />
            </button>
            {o && <div class="card-body stack-body">{it.body}</div>}
          </section>,
          below && (
            <div
              key={it.id + '-split'}
              class="stack-split"
              role="separator"
              aria-orientation="horizontal"
              title="Drag to resize"
              onPointerDown={(e) => {
                const a = refs.current[it.id], b = refs.current[below.id]
                if (!a || !b) return
                const ha = a.getBoundingClientRect().height, hb = b.getBoundingClientRect().height
                const wa = weight(it), wb = weight(below)
                drag(e as unknown as PointerEvent, 'y', (d) => {
                  const na = Math.min(ha + hb - 70, Math.max(70, ha + d))
                  const nwa = ((wa + wb) * na) / (ha + hb)
                  setWeights((cur) => {
                    const next = { ...cur, [it.id]: nwa, [below.id]: wa + wb - nwa }
                    save(key, next)
                    return next
                  })
                })
              }}
            />
          ),
        ]
      })}
    </div>
  )
}
