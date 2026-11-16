/** Icons for field values (SPEC §11.3). */
import {
  BrickWall, CircleQuestionMark, CircleX, Crosshair, Ellipsis, Equal, ExternalLink, Eye, Feather, Flag,
  FlagTriangleRight, Heart, Link, Minimize2, MoveDiagonal, Scale, Scissors, Search, Shield, ShieldCheck,
  Skull, Swords, TriangleExclamationPoint, Users, Zap,
} from 'lucide-preact'
import type { LucideIcon } from 'lucide-preact'

type Icon = LucideIcon

export const STYLE_ICONS: Record<string, [Icon, string]> = {
  aggressive: [Swords, 'Aggressive'],
  balanced: [Scale, 'Balanced'],
  solid: [Shield, 'Solid'],
}
export const PURPOSE_ICONS: Record<string, [Icon, string]> = {
  territory: [Flag, 'Territory'],
  influence: [BrickWall, 'Influence'],
  sente: [Zap, 'Sente'],
  attack: [Crosshair, 'Attack'],
  defend: [ShieldCheck, 'Defend'],
  sabaki: [Feather, 'Sabaki (light play)'],
  probe: [Search, 'Probe'],
  reduce: [Minimize2, 'Reduce'],
  connect: [Link, 'Connect'],
  cut: [Scissors, 'Cut'],
  eye: [Eye, 'Make eyes'],
  kill: [Skull, 'Kill'],
}
export const CONDITION_ICONS: Record<string, [Icon, string]> = {
  ladder: [MoveDiagonal, 'Depends on a ladder'],
  'needs-support': [Users, 'Needs nearby support'],
  'bad-near-opponent': [TriangleExclamationPoint, 'Bad near opponent stones'],
  'ko-threats': [Zap, 'Needs ko threats'],
}
export const STATUS_ICONS: Record<string, [Icon, string]> = {
  start: [FlagTriangleRight, 'Start position'],
  progress: [Ellipsis, 'In progress'],
  end: [Flag, 'Joseki end'],
  'end-mistake': [TriangleExclamationPoint, 'End after a mistake'],
  link: [ExternalLink, 'Continues in another entry'],
}
export const SHAPE_ICONS: Record<string, [Icon, string]> = {
  alive: [Heart, 'Alive'],
  dead: [CircleX, 'Dead'],
  ko: [Zap, 'Ko'],
  seki: [Equal, 'Seki'],
  unsettled: [CircleQuestionMark, 'Unsettled'],
}

export function IconLabel({ map, value, show }: { map: Record<string, [Icon, string]>; value: string; show: boolean }) {
  const hit = map[value]
  if (!hit) return <span>{value}</span>
  const [I, label] = hit
  return (
    <span class="icon-label" title={label}>
      {show && <I size={15} aria-hidden />}
      {label}
    </span>
  )
}
