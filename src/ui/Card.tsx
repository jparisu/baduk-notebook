/** Foldable cards and sections (SPEC §8.1): open or closed state is remembered per browser. */
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { ChevronDown } from 'lucide-preact'
import { storageKey } from '../storage'

const KEY = storageKey('baduk-notebook.folds.v1')
function loadFolds(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function useFold(id: string, defaultOpen = true): [boolean, () => void] {
  const [open, setOpen] = useState(() => loadFolds()[id] ?? defaultOpen)
  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...loadFolds(), [id]: next }))
    } catch {
      /* ignore */
    }
  }
  return [open, toggle]
}

/** A card with a header that folds it. */
export function Card(props: {
  id: string
  title: ComponentChildren
  icon?: ComponentChildren
  class?: string
  style?: Record<string, string>
  defaultOpen?: boolean
  children: ComponentChildren
}) {
  const [open, toggle] = useFold(props.id, props.defaultOpen ?? true)
  return (
    <section class={`card ${props.class ?? ''} ${open ? '' : 'closed'}`} style={props.style} data-card={props.id}>
      <button class="card-head" aria-expanded={open} onClick={toggle}>
        {props.icon}
        <span class="card-title">{props.title}</span>
        <ChevronDown class="chev" size={16} aria-hidden />
      </button>
      {open && <div class="card-body">{props.children}</div>}
    </section>
  )
}

/** A smaller foldable section inside a card. */
export function Fold(props: { id: string; title: string; defaultOpen?: boolean; children: ComponentChildren }) {
  const [open, toggle] = useFold(props.id, props.defaultOpen ?? true)
  return (
    <div class={`fold ${open ? '' : 'closed'}`}>
      <button class="fold-head" aria-expanded={open} onClick={toggle}>
        {props.title}
        <ChevronDown class="chev" size={14} aria-hidden />
      </button>
      {open && <div class="fold-body">{props.children}</div>}
    </div>
  )
}
