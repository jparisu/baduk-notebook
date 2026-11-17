/** Text with visual references: hovering or tapping a reference shows its marks on the board (SPEC §5, §8.5). */
import type { Segment } from '../core/refs'

export interface RefHandlers {
  hovered: string | null
  pinned: string | null
  colors: Map<string, string> | null // set when "always show" is on
  /** false when the setting says "click or tap only" */
  hover?: boolean
  onHover: (id: string | null) => void
  onPin: (id: string) => void
}

export function Rich({ segments, h }: { segments: Segment[]; h: RefHandlers }) {
  return (
    <>
      {segments.map((s, i) =>
        'text' in s ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span
            key={i}
            class={`ref ${h.pinned === s.id ? 'pinned' : ''} ${h.hovered === s.id ? 'hovered' : ''}`}
            style={h.colors?.get(s.id) ? { borderBottomColor: h.colors.get(s.id), borderBottomStyle: 'solid' } : undefined}
            tabIndex={0}
            role="button"
            aria-pressed={h.pinned === s.id}
            // Hover only with a real mouse: on touch screens a tap would leave the hover stuck.
            onPointerEnter={(e) => h.hover !== false && e.pointerType === 'mouse' && h.onHover(s.id)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && h.onHover(null)}
            onClick={(e) => {
              e.stopPropagation()
              h.onHover(null)
              h.onPin(s.id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                h.onPin(s.id)
              }
            }}
          >
            {s.label}
          </span>
        ),
      )}
    </>
  )
}
