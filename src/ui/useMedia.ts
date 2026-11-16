import { useEffect, useState } from 'preact/hooks'

/** True while the media query matches (e.g. phone width). */
export function useMedia(query: string): boolean {
  const get = () => typeof matchMedia === 'function' && matchMedia(query).matches
  const [match, setMatch] = useState(get)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}
