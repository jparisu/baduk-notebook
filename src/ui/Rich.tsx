/** Text with visual references: hovering or tapping a reference shows its marks on the board (SPEC §5, §8.5). */
import type { Segment } from '../core/refs'

export interface RefHandlers {
  hovered: string | null
  pinned: string | null
  colors: Map<string, string> | null // set when "always show" is on
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
            onMouseEnter={() => h.onHover(s.id)}
            onMouseLeave={() => h.onHover(null)}
            onFocus={() => h.onHover(s.id)}
            onBlur={() => h.onHover(null)}
            onClick={() => h.onPin(s.id)}
          >
            {s.label}
          </span>
        ),
      )}
    </>
  )
}
