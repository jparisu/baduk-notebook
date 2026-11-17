/**
 * Names for browser storage. The main site and the pull request previews share one browser origin
 * (jparisu.github.io), so each preview gets its own names and never touches the main site's data.
 */
const MAIN_BASE = '/baduk-notebook/'
const BASE: string = import.meta.env?.BASE_URL ?? MAIN_BASE

export const storageKey = (name: string) => (BASE === MAIN_BASE || BASE === '/' ? name : `${name}@${BASE}`)

/** True when this build is a pull request preview. */
export const isPreview = BASE !== MAIN_BASE && BASE !== '/'
export const previewName = isPreview ? BASE.replace(/^.*\/(pr-\d+)\/?$/, '$1') : null
