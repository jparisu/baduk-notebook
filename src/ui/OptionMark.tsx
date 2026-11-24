/**
 * The mark of a tag option (docs/MODEL.md §3.1): only a color → a filled circle; only an icon → the
 * icon; both → a circle with the icon inside. How that last one looks is a setting of this browser
 * (Settings › Option marks): a ring in the color with the icon in that color, or a filled circle with
 * the icon cut out of it (styles.css, `data-marks` on the page).
 */
import type { TagOption } from '../core/tags'

export function OptionMark({ o, icons = true }: { o: TagOption | undefined; icons?: boolean }) {
  if (!o) return null
  const icon = icons ? o.icon : undefined
  if (o.color && icon) return <span class="omark" style={{ '--c': o.color } as never} aria-hidden><span>{icon}</span></span>
  if (o.color) return <span class="dot tone" style={{ background: o.color }} aria-hidden />
  if (icon) return <span class="ico" aria-hidden>{icon}</span>
  return null
}
