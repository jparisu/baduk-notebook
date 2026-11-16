/** Message blocks: told apart by shape, border and icon, not only color (SPEC §8.5 "Message blocks"). */
import type { ComponentChildren } from 'preact'
import { Grid3x3, MessageSquare, Pencil, TriangleExclamationPoint } from 'lucide-preact'

export type MessageKind = 'move' | 'pos' | 'warn' | 'note'

const ICON = { move: MessageSquare, pos: Grid3x3, warn: TriangleExclamationPoint, note: Pencil }

export function Message(props: {
  kind: MessageKind
  title: string
  db: string
  dbColor: string
  callout?: boolean
  faded?: boolean
  onClick?: () => void
  children: ComponentChildren
}) {
  const I = ICON[props.kind]
  return (
    <div class={`msg ${props.kind} ${props.callout ? 'callout' : ''} ${props.faded ? 'faded' : ''}`} onClick={props.onClick}>
      <div class="mh">
        <I size={15} aria-hidden />
        {props.title}
        <span class="badge" style={{ borderColor: props.dbColor, color: props.dbColor }}>{props.db}</span>
      </div>
      <div class="mt">{props.children}</div>
    </div>
  )
}
