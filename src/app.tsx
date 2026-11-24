import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  ArrowLeftRight, ArrowRight, Link2, BookOpen, GitBranch, Grid3x3, MessageSquare, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, ChevronLeft, ChevronRight, Contrast, Flag, Menu, Pencil, Plus, RotateCcw, Save,
  Settings as SettingsIcon, SkipBack, SkipForward, SlidersHorizontal, Trash2, Upload, X,
  FileDown, FileUp,
} from 'lucide-preact'
import { loadDatabases, type DatabaseInfo } from './data/load'
import { buildGraph, type Graph } from './core/graph'
import { CATEGORIES, MOVE_CATEGORIES } from './core/kinds'
import { apply, applySign, compose, cornerWindow, inverse, ptName, userTransform, type Corner, type Pt, type Sign } from './core/geometry'
import type { Mark } from './core/refs'
import { applyTheme, loadSettings, saveSettings, type Settings } from './settings'
import {
  candidates, displayBoard, mainLine, mainMove, openPath, entryFields, frame, inBook, labelStart, moveOf, movesOf, playFree, positionFields, primaryLabel,
  replay, rootStep, startStep, toMove, type Candidate, type Ctx, type Start, type Step,
} from './view'
import { collectMessages } from './messages'
import { Board } from './ui/Board'
import { Tree } from './ui/Tree'
import { Stack, Workbench } from './ui/Workbench'
import { CategoryDot, LastMove, MoveMark, NextMoves, PositionInfo, isVariation } from './ui/Panels'
import { Card } from './ui/Card'
import { type RefHandlers } from './ui/Rich'
import { SettingsDialog } from './ui/SettingsDialog'
import { Library } from './ui/Library'
import { useMedia } from './ui/useMedia'
import { EditPanel, type EditTab } from './ui/EditPanel'
import { ExportDialog, TagsDialog, NewDatabaseDialog, NewEntryDialog, SaveLinesDialog, type SessionLineView } from './ui/Dialogs'
import { FindMode } from './ui/FindMode'
import { QuizMode } from './ui/QuizMode'
import { download } from './edit/workspace'
import { importSgf, toSgf } from './edit/sgfx'
import { updateRegistry } from './edit/workspace'
import { changeCount, createWorkspace, discardDrafts, restoreDrafts, saveDrafts, type Workspace } from './edit/workspace'
import { checkMove, createDatabase, createEntry, deleteMove, locate, orderMoves, setTags, type On } from './edit/ops'
import { asList, sortKeys, type TagValue } from './core/tags'
import { boardMarks, writeBoard, type MarkType } from './core/refs'
import { boardOf, seqName, stonesOf } from './core/model'
import { previewName, storageKey } from './storage'
import { decodeLine, linkFor, readUrl } from './share'
import { erase, loadPosition, loadSession, loadTrail, record, remove, savePosition, saveSession, saveTrail, sameStart, visit, type Line } from './session'

// Distinct colors for "always show" references (SPEC §11.2).
const REF_PALETTE = ['#d81b60', '#1e88e5', '#00897b', '#f4511e', '#8e24aa', '#6d4c41', '#3949ab', '#c0ca33']

type Mode = 'explore' | 'design' | 'find' | 'quiz'
type Tool = 'move' | MarkType | 'AB' | 'AW' | 'AE'
/** Edit tools: id, button text, explanation (shown on hover and long-press). */
const TOOLS: [Tool, string, string][] = [
  ['move', 'Play', 'Play moves (saved when you annotate them or use Save lines)'],
  ['TR', '△ Triangle', 'Triangle mark on a point'],
  ['SQ', '□ Square', 'Square mark on a point'],
  ['CR', '○ Circle', 'Circle mark on a point'],
  ['MA', '✕ Cross', 'X mark on a point'],
  ['LB', 'A Letter', 'Letters A, B, C… on points'],
  ['CUT', '✂ Cut', 'Cutting point'],
  ['EYE', '◉ Eye', 'Eye: a point that is (or becomes) an eye'],
  ['WALL', '▬ Wall', 'Wall: a barrier of stones that stops influence (click start and end)'],
  ['INF', '⇢ Influence', 'Direction where a wall or group exerts influence (click start and end)'],
  ['AR', '→ Arrow', 'Plain arrow (click start and end)'],
  ['AB', '● Black stone', 'Set-up black stone (start position only)'],
  ['AW', '○ White stone', 'Set-up white stone (start position only)'],
  ['AE', '⌫ Erase stone', 'Remove a set-up stone (start position only)'],
]
const PAIR_TOOLS = new Set<Tool>(['WALL', 'INF', 'AR'])
const SETUP_TOOLS = new Set<Tool>(['AB', 'AW', 'AE'])
const REF_TYPES: [string, string][] = [
  ['TR', 'Triangle'], ['SQ', 'Square'], ['CR', 'Circle'], ['MA', 'Cross'], ['CUT', 'Cutting point'], ['EYE', 'Eye'], ['WALL', 'Wall'], ['INF', 'Influence'], ['AR', 'Arrow'],
]

export function App() {
  const ws = useRef<Workspace | null>(null)
  const [graph, setGraph] = useState<Graph | null>(null)
  const [, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettingsState] = useState<Settings>(loadSettings)
  const [mode, setMode] = useState<Mode>('explore')
  const [lib, setLib] = useState<'joseki' | 'shape'>('joseki')
  const [drawer, setDrawer] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [start, setStart] = useState<Start>({ kind: 'empty' })
  const [line, setLine] = useState<{ path: Step[]; future: Step[] }>({ path: [], future: [] })
  const path = line.path
  const [session, setSessionState] = useState<Line[]>(loadSession)
  const [side, setSide] = useState<1 | -1>(1)
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | 'settings' | 'export' | 'new-start' | 'new-db' | 'save-lines' | 'keys'>(null)
  const [edit, setEdit] = useState(false)
  const [target, setTarget] = useState<string>('')
  const [tool, setTool] = useState<Tool>('move')
  const [pending, setPending] = useState<Pt[]>([])
  const [refType, setRefType] = useState<string | null>(null)
  // The editor opens on the move you just played (its kind is what you set most); the start of a line has only its position.
  const [editTab, setEditTab] = useState<EditTab>('move')
  const [phoneTab, setPhoneTab] = useState<'next' | 'pos' | 'tree' | 'edit'>('next')
  const [toast, setToast] = useState<string | null>(null)
  // Design tab (SPEC §8.10)
  const [onlyNew, setOnlyNew] = useState(false)
  const [ahead, setAhead] = useState<number | null>(null)
  const [trail, setTrailState] = useState<Line[]>(loadTrail)
  const setTrail = (t: Line[]) => {
    setTrailState(t)
    saveTrail(t)
  }
  /** Moves that existed when Design was opened ("parent>child"): the others are new (Only new). */
  const known = useRef<Set<string> | null>(null)
  const [showFolded, setShowFolded] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ line: Step[]; x: number; y: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Step[] | null>(null)
  const [folded, setFoldedState] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storageKey('baduk-notebook.tree.hidden')) ?? '[]'))
    } catch {
      return new Set()
    }
  })
  const setFolded = (f: Set<string>) => {
    setFoldedState(f)
    try {
      localStorage.setItem(storageKey('baduk-notebook.tree.hidden'), JSON.stringify([...f]))
    } catch {
      /* ignore */
    }
  }
  const lastText = useRef<HTMLTextAreaElement | null>(null)
  // Board clicks that arrive before the screen caught up with the previous one wait for the next render.
  const settling = useRef(false)
  const onPointRef = useRef<(pt: Pt) => void>(() => {})
  const latest = useRef<{ start: Start; path: Step[] }>({ start: { kind: 'empty' }, path: [] })
  // Three columns only fit with the board at its full size above 1100px; below, the panels stack under the board.
  const phone = useMedia('(max-width: 1100px)')

  const setSettings = (s: Settings) => {
    setSettingsState(s)
    saveSettings(s)
  }
  const setSession = (l: Line[]) => {
    setSessionState(l)
    saveSession(l)
  }
  useEffect(() => applyTheme(settings), [settings.theme, settings.colorMode])

  const databases: DatabaseInfo[] = ws.current?.databases ?? []
  const active = useMemo(
    () => new Set(settings.activeDatabases ?? databases.filter((d) => d.activeByDefault).map((d) => d.id)),
    [settings.activeDatabases, databases],
  )
  const shown = useMemo(() => (edit && target ? new Set([...active, target]) : active), [active, edit, target])
  const ctx: Ctx | null = graph ? { graph, active: shown, order: databases.map((d) => d.id), U: userTransform(settings.display) } : null

  // Load the databases, restore drafts, and reopen the last position.
  useEffect(() => {
    loadDatabases()
      .then(async ({ databases, texts, tagsText }) => {
        const w = createWorkspace(databases, texts, tagsText)
        const restored = await restoreDrafts(w)
        ws.current = w
        const g = buildGraph(w.files)
        let s0 = loadSettings()
        const act = new Set(s0.activeDatabases ?? w.databases.filter((d) => d.activeByDefault).map((d) => d.id))
        // A shared link wins over the last position (SPEC §8.9).
        const shared = readUrl()
        let note: string | null = null
        if (shared?.start.kind === 'label') {
          const e = g.entries.get(shared.start.id)
          if (!e) {
            note = `"${shared.start.id}" is not in the databases of this site.`
          } else if (!e.contribs.some((c) => act.has(c.db))) {
            // The link points into a database that is switched off here: switch it on.
            const dbs = [...new Set(e.contribs.map((c) => c.db))]
            dbs.forEach((d) => act.add(d))
            s0 = { ...s0, activeDatabases: w.databases.map((d) => d.id).filter((d) => act.has(d)) }
            note = `Switched on ${dbs.join(', ')} to open this link.`
          }
        }
        if (shared?.view) s0 = { ...s0, display: shared.view }
        if (shared) {
          setSettingsState(s0)
          saveSettings(s0)
        }
        const c: Ctx = { graph: g, active: act, order: w.databases.map((d) => d.id), U: userTransform(s0.display) }
        const last = loadPosition()
        const useShared = shared && !(shared.start.kind === 'label' && !g.entries.has(shared.start.id))
        const st: Start = useShared ? shared!.start : last?.start ?? { kind: 'empty' }
        const p = useShared ? decodeLine(c, st, shared!.line) : replay(c, st, last?.moves ?? [])
        const before = useShared ? openPath(c, st).length - 1 : 0 // moves that lead to the opened sequence
        if (useShared && shared!.line && p.length - 1 - before < shared!.line.split('.').length) note = `This link's moves stop at move ${p.length - 1 - before}: the next one cannot be played.`
        setStart(st)
        setLine({ path: p, future: [] })
        if (note) setToast(note)
        setGraph(g)
        setTarget(w.databases[w.databases.length - 1]?.id ?? '')
        if (restored && !note) setToast(`Restored ${restored} unsaved change${restored > 1 ? 's' : ''} from this browser.`)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])
  const flash = (m: string) => setToast(m)

  /** Rebuilds the line (and the moves after it) on the current graph and databases. */
  const rebuild = (c: Ctx, st: Start, l: { path: Step[]; future: Step[] }) => {
    const all = replay(c, st, [...movesOf(l.path), ...l.future.map((s) => moveOf(s)!)])
    return { path: all.slice(0, Math.max(1, Math.min(l.path.length, all.length))), future: all.slice(l.path.length) }
  }
  useEffect(() => {
    if (ctx && path.length) setLine((l) => rebuild(ctx, start, l))
  }, [graph, shown])

  // Remember the last position (SPEC: reopen where you left), also when the page closes.
  useLayoutEffect(() => {
    if (!path.length) return
    savePosition({ start, moves: movesOf(path) })
    // The trail keeps every line you visit, so the tree does not lose the branches you leave.
    const t = visit(trail, { start, moves: movesOf(path) })
    if (t !== trail) setTrail(t)
  }, [path, start])
  useEffect(() => {
    settling.current = false
    latest.current = { start, path }
  })
  useEffect(() => {
    const save = () => latest.current.path.length && savePosition({ start: latest.current.start, moves: movesOf(latest.current.path) })
    window.addEventListener('pagehide', save)
    return () => window.removeEventListener('pagehide', save)
  }, [])

  // The address bar always holds the link to what is on the board (explore mode).
  // Layout effect: updated in the same step as the screen, so a reload never reads an older link.
  useLayoutEffect(() => {
    if (!ctx || !path.length || (mode !== 'explore' && mode !== 'design')) return
    const url = linkFor(ctx, start, path, settings.display)
    try {
      history.replaceState(null, '', url ?? location.pathname)
    } catch {
      /* ignore */
    }
  }, [path, start, settings.display, mode, graph])

  // Keep the current tree node visible.
  useEffect(() => {
    document.querySelector('.tree-node.cur')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [path])

  const dbColor = (id: string) => settings.dbColors?.[id] ?? databases.find((d) => d.id === id)?.color ?? '#888'
  const entries = graph ? [...graph.entries.values()].filter((e) => e.defined && e.contribs.some((c) => shown.has(c.db))) : []
  const entryName = (id: string) => (ctx && ctx.graph.entries.has(id) ? entryFields(ctx, id, rootStep(ctx, id)).text('name') || seqName(id) : seqName(id))

  const toggleDb = (id: string) => {
    const next = new Set(active)
    next.has(id) ? next.delete(id) : next.add(id)
    setSettings({ ...settings, activeDatabases: databases.map((d) => d.id).filter((d) => next.has(d)) })
  }

  const resetMarks = () => {
    setPinned(null)
    setHovered(null)
    setPending([])
  }
  const go = (p: Step[]) => {
    setLine({ path: p, future: [] })
    resetMarks()
  }
  function openStart(st: Start) {
    if (!ctx) return
    setStart(st)
    setLine({ path: openPath(ctx, st), future: [] })
    setDrawer(false)
    resetMarks()
  }
  // Back and forward keep the moves you step over, in or out of the databases.
  const back = () => {
    resetMarks()
    setLine((l) => (l.path.length > 1 ? { path: l.path.slice(0, -1), future: [l.path[l.path.length - 1], ...l.future] } : l))
  }
  // The line shown ahead in the tree (set while rendering): → and End follow it.
  const aheadRef = useRef<{ path: Step[]; ahead: Step[] }>({ path: [], ahead: [] })
  const shownAhead = (l: { path: Step[]; future: Step[] }) =>
    l.future.length ? l.future : aheadRef.current.path === l.path ? aheadRef.current.ahead : []
  const forward = () => {
    resetMarks()
    setLine((l) => {
      if (!ctx || !l.path.length) return l
      // Only moves you stepped back over are kept as the future; otherwise the line ahead (your last line
      // through here, else the main line) is worked out again at each step, so a new main move counts at once.
      if (l.future.length) return { path: [...l.path, l.future[0]], future: l.future.slice(1) }
      const ahead = shownAhead(l)
      return ahead.length ? { path: [...l.path, ahead[0]], future: [] } : l
    })
  }
  /** Down: one move forward, along the next variation instead of the line → follows. */
  const down = () => {
    if (!ctx) return
    resetMarks()
    setLine((l) => {
      const ahead = shownAhead(l)[0]
      const list = candidates(ctx, l.path[l.path.length - 1]).filter((c) => !c.cat || !settings.hiddenCategories.includes(c.cat))
      const c = list.find((x) => x.step.key !== ahead?.key)
      return c ? { path: [...l.path, c.step], future: [] } : l
    })
  }
  const toStart = () => {
    resetMarks()
    setLine((l) => ({ path: l.path.slice(0, 1), future: [...l.path.slice(1), ...l.future] }))
  }
  const toEnd = () => {
    resetMarks()
    setLine((l) => (!ctx ? l : { path: [...l.path, ...shownAhead(l)], future: [] }))
  }

  /** After an edit: rebuild the graph, keep the line, drop session lines that are now stored, save drafts. */
  const commit = (msg?: string) => {
    const w = ws.current!
    const g = buildGraph(w.files)
    const c: Ctx = { graph: g, active: shown, order: w.databases.map((d) => d.id), U: userTransform(settings.display) }
    setGraph(g)
    setLine((l) => rebuild(c, start, l))
    setSession(session.filter((l) => replay(c, l.start, l.moves).some((s) => s.free && !s.edge)))
    setVersion(w.version)
    saveDrafts(w)
    if (msg) flash(msg)
  }

  // Keyboard: navigation everywhere; fast annotation keys in edit mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (/INPUT|SELECT|TEXTAREA/.test(el.tagName)) {
        if (e.key === 'Escape') el.blur()
        return
      }
      if (!ctx || (mode !== 'explore' && mode !== 'design') || dialog) return
      const nav: Record<string, () => void> = { ArrowLeft: back, ArrowRight: forward, ArrowDown: down, Home: toStart, End: toEnd }
      if (nav[e.key]) {
        e.preventDefault()
        nav[e.key]()
        return
      }
      if (!edit || e.ctrlKey || e.metaKey || e.altKey) return
      const cats = MOVE_CATEGORIES
      const k = e.key.toLowerCase()
      const styles: Record<string, string> = { a: 'aggressive', b: 'balanced', s: 'solid' }
      if (/^[1-8]$/.test(k) && path.length > 1 && cats[Number(k) - 1]) {
        const c = cats[Number(k) - 1]
        writeNode('move', { kind: c }, `Saved as ${CATEGORIES[c].label.toLowerCase()} in ${target}`)
      } else if (styles[k] && path.length > 1) {
        writeNode('move', { intention: [styles[k]] }, `Intention: ${styles[k]}`)
      } else if (k === 'p') {
        playFreeMove(null)
      } else if (e.key === 'Enter') {
        (setEditTab('move'), setTimeout(() => document.getElementById('f-move-comment')?.focus(), 30))
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error) return <div class="pane error-box">Could not load the databases: {error}</div>
  if (!ctx || !ws.current || !path.length) return <div class="pane loading">Loading databases…</div>
  const w = ws.current

  const step = path[path.length - 1]
  const F = frame(ctx, step)
  const board = displayBoard(ctx, step)
  const toPlay = toMove(ctx, step)
  const label = primaryLabel(ctx, path, start.kind === 'label' ? start.id : null)
  const win: [number, number, number, number] = settings.view === 'full' ? [0, 18, 0, 18] : cornerWindow(settings.display.corner)
  const offBook = !inBook(ctx, step)
  const firstFree = path.findIndex((s) => !inBook(ctx, s))

  /* ---- playing and editing ---- */
  const lastMove = moveOf(step)
  const lastSign = lastMove ? applySign(frame(ctx, path[path.length - 2]), lastMove.sign) : 0

  function playFreeMove(pt: Pt | null) {
    const sign: Sign = toPlay || (bothSides ? side : lastSign ? ((-lastSign) as Sign) : side)
    const check = checkMove(ctx!, path, sign, pt)
    if (!check.ok) return flash(check.reason)
    const next = playFree(ctx!, step, sign, pt)
    const fut = line.future[0]
    const newPath = [...path, next]
    setLine({ path: newPath, future: fut && fut.key === next.key ? line.future.slice(1) : [] })
    resetMarks()
    if (newPath.some((s) => s.free && !s.edge)) setSession(record(session, { start, moves: movesOf(newPath) }))
    if (inBook(ctx!, step) && !inBook(ctx!, next)) flash('Not in your databases. Keep playing; your moves are kept in this session.')
    else if (!inBook(ctx!, step) && inBook(ctx!, next)) flash('Back in a known position.')
  }

  function playCandidate(c: Candidate) {
    const fut = line.future[0]
    setLine({ path: [...path, c.step], future: fut && fut.key === c.step.key ? line.future.slice(1) : [] })
    resetMarks()
  }

  function writeNode(on: On, values: Record<string, TagValue | null>, msg?: string) {
    writeAt(path, on, values, msg)
  }
  /** Writes tags on the move or position at the end of `at` (saving the line up to it). */
  function writeAt(at: Step[], on: On, values: Record<string, TagValue | null>, msg?: string) {
    const loc = locate(w, ctx!, at, target, primaryLabel(ctx!, at), true)!
    setTags(w, loc, on, values)
    commit(msg)
  }

  /** Focuses the first of these fields that exists, once the panel has drawn the new position. */
  function focusLater(...ids: string[]) {
    setTimeout(() => {
      const el = ids.map((id) => document.getElementById(id)).find(Boolean)
      el?.scrollIntoView({ block: 'nearest' })
      el?.focus()
    }, 60)
  }

  /** Sets the order of the moves after the last position of `at` (docs/MODEL.md §1): the first is the main move. */
  function orderAt(at: Step[], children: Step[]) {
    orderMoves(w, ctx!, at, target, primaryLabel(ctx!, at), children)
    commit(`Order of the next moves saved in ${target}`)
  }
  /** Makes the last move of `at` the main move of the position before it: it becomes the first of its moves. */
  function makeMain(at: Step[]) {
    if (at.length < 2) return
    const parent = at.slice(0, -1)
    const rest = candidates(ctx!, parent[parent.length - 1]).map((c) => c.step).filter((s) => s.key !== at[at.length - 1].key)
    orderAt(parent, [at[at.length - 1], ...rest])
  }
  /** Edits go into another database (to change a value that database stores). */
  function switchTarget(db: string) {
    setTarget(db)
    flash(`Editing into ${db}`)
  }

  function onPoint(pt: Pt) {
    settling.current = true
    if (!edit || (tool === 'move' && !refType)) return playFreeMove(pt)
    if (refType) return setPending([...pending, pt])
    const setup = SETUP_TOOLS.has(tool)
    if (setup && path.length > 1) return flash('Set-up stones can only be changed at the start position.')
    // Set-up stones edit the start of the opened sequence (read from the graph, so quick clicks see the last change).
    const first = setup && start.kind === 'label' && ctx!.graph.entries.has(start.id) ? rootStep(ctx!, start.id) : path[0]
    const loc = locate(w, ctx!, setup ? [first] : path, target, label, true)!
    const toDisplay = compose(setup ? frame(ctx!, first) : F, loc.T)
    const sp = apply(inverse(toDisplay), pt)
    const marks = boardMarks(asList(loc.pos.tags.board))
    const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1]
    const saveMarks = (list: Mark[]) => {
      setTags(w, loc, 'pos', { board: writeBoard(list) })
      commit()
    }
    if (setup) {
      // Set-up stones change the start position itself, so only while it has no moves yet.
      if (loc.pos.moves.length) return flash('Set-up stones can only change while the start position has no moves.')
      const b = boardOf(loc.pos.stones)
      const [x, y] = apply(inverse(toDisplay), pt)
      b[y][x] = tool === 'AE' ? 0 : (tool === 'AB') !== toDisplay.swap ? 1 : -1
      loc.pos.stones = stonesOf(b)
      setTags(w, loc, 'pos', {})
      return commit()
    }
    const type = tool as MarkType
    if (PAIR_TOOLS.has(tool)) {
      if (!pending.length) return setPending([pt])
      const from = apply(inverse(toDisplay), pending[0])
      setPending([])
      return saveMarks([...marks, { type, pts: [from, sp] }])
    }
    // Point marks: a second click on the same point removes it.
    const has = marks.find((m) => m.type === type && same(m.pts[0], sp))
    if (has) return saveMarks(marks.filter((m) => m !== has))
    const letter = type === 'LB' ? String.fromCharCode(65 + marks.filter((m) => m.type === 'LB').length) : undefined
    saveMarks([...marks, { type, pts: [sp], label: letter }])
  }

  function insertRef() {
    if (!refType || !pending.length) return
    const ta = lastText.current
    if (!ta || !document.body.contains(ta)) return flash('Click in a text box first, then pick the points.')
    const loc = locate(w, ctx!, path, target, label, true)!
    const toFile = inverse(compose(F, loc.T))
    const names = pending.map((p) => ptName(apply(toFile, p)))
    const body = ['WALL', 'INF', 'AR'].includes(refType) ? `${names[0]}-${names[1] ?? names[0]}` : names.join(',')
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd)
    ta.setRangeText(`{{${refType}:${body}${sel ? '|' + sel : ''}}}`, ta.selectionStart, ta.selectionEnd, 'end')
    ta.focus()
    setPending([])
    setRefType(null)
  }

  function clearMarks() {
    const loc = locate(w, ctx!, path, target, label, false)
    if (!loc) return
    setTags(w, loc, 'pos', { board: null })
    commit('Marks cleared on this position')
  }

  async function copyLink(url: string | null, what: string) {
    if (!url) return flash('Positions set up by hand have no link yet.')
    try {
      await navigator.clipboard.writeText(url)
      flash(`Link to ${what} copied`)
    } catch {
      flash(url)
    }
  }

  /* ---- session lines ---- */
  const startLabel = start.kind === 'label' ? start.id : null
  const sessionSteps = session.filter((l) => sameStart(l.start, start)).map((l) => ({ line: l, steps: replay(ctx, start, l.moves) }))
  const unsaved = sessionSteps.filter((s) => s.steps.some((st) => st.free && !st.edge))
  const lineViews: SessionLineView[] = unsaved.map((s, id) => {
    const curMoves = movesOf(path)
    const lm = s.line.moves
    const n = Math.min(curMoves.length, lm.length)
    const current = curMoves.slice(0, n).every((m, i) => m.sign === lm[i].sign && JSON.stringify(m.pt) === JSON.stringify(lm[i].pt))
    return {
      id,
      current,
      newMoves: s.steps.filter((st) => st.free && !st.edge).length,
      moves: s.steps.slice(1).map((st, i) => {
        const m = moveOf(st)!
        const pt = m.pt ? apply(frame(ctx, s.steps[i]), m.pt) : null
        return { name: pt ? ptName(pt) : 'pass', known: !!st.edge }
      }),
    }
  })
  function saveLines(ids: number[], into: string) {
    let left = session
    for (const id of ids) {
      const s = unsaved[id]
      locate(w, ctx!, s.steps, into, startLabel, true)
      left = remove(left, s.line)
    }
    setTarget(into)
    setSession(left)
    setDialog(null)
    commit(`Saved ${ids.length} line${ids.length === 1 ? '' : 's'} to ${into}`)
  }
  function eraseVariation() {
    setSession(erase(session, start, movesOf(path)))
    setTrail(erase(trail, start, movesOf(path)))
    go(path.slice(0, -1))
    flash('Variation erased from this session')
  }
  const extraChildren = (keys: string[]) => {
    const out: Step[] = []
    for (const { steps } of sessionSteps) {
      if (steps.length <= keys.length || !keys.every((k, i) => steps[i].key === k)) continue
      const s = steps[keys.length]
      if (s.free && !s.edge && !out.some((o) => o.key === s.key)) out.push(s)
    }
    return out
  }
  const tagOf = (key: string) => {
    const e = entries.find((e) => e.root === key)
    return e ? entryName(e.id) : null
  }

  onPointRef.current = (pt: Pt) => (settling.current ? setTimeout(() => onPointRef.current(pt), 30) : onPoint(pt))

  /* ---- what the board shows ---- */
  const numbers = new Map<string, number>()
  let last: Pt | null = null
  path.forEach((st, i) => {
    const mv = moveOf(st)
    if (!mv) return
    const pt = mv.pt ? apply(frame(ctx, path[i - 1]), mv.pt) : null
    if (pt) numbers.set(`${pt[0]},${pt[1]}`, i)
    if (i === path.length - 1) last = pt
  })
  const allCands = candidates(ctx, step).filter((c) => !c.cat || !settings.hiddenCategories.includes(c.cat))
  const bothSides = allCands.some((c) => c.sign === 1) && allCands.some((c) => c.sign === -1)
  const cands = bothSides ? allCands.filter((c) => c.sign === side) : allCands
  const tenuki = cands.find((c) => !c.pt)

  const messages = collectMessages(ctx, path, settings)
  const refMarks = new Map<string, Mark[]>()
  for (const m of messages) for (const s of m.segments) if ('ref' in s) refMarks.set(s.id, s.ref)
  if (label) {
    const ef = entryFields(ctx, label, path[labelStart(ctx, path, label)])
    for (const t of ef.comments()) for (const s of t.segments) if ('ref' in s) refMarks.set(s.id, s.ref)
  }
  const colors = settings.aids === 'always' ? new Map([...refMarks.keys()].map((id, i) => [id, REF_PALETTE[i % REF_PALETTE.length]])) : null
  const shownRefs = colors ? [...refMarks.keys()] : [hovered ?? pinned].filter((x): x is string => !!x)
  const marks: Mark[] = [
    ...(settings.overlays || edit ? positionFields(ctx, step).marks() : []),
    ...shownRefs.flatMap((id) =>
      (refMarks.get(id) ?? []).map((m) => ({ ...m, color: colors ? colors.get(id) : undefined })).map((m) =>
        colors && (hovered ?? pinned) && (hovered ?? pinned) !== id ? { ...m, color: 'rgba(128,128,128,.45)' } : m,
      ),
    ),
  ]
  const refs: RefHandlers = { hovered, pinned, colors, hover: settings.aids === 'hover', onHover: setHovered, onPin: (id) => setPinned((p) => (p === id ? null : id)) }

  const moveNo = path.length - 1
  const lastName = `${lastSign === 1 ? 'Black' : 'White'} ${last ? ptName(last) : 'tenuki'}`
  const setDisplay = (d: Partial<Settings['display']>) => setSettings({ ...settings, display: { ...settings.display, ...d } })
  const nChanges = changeCount(w)

  let touch: { x: number; y: number } | null = null
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touch = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: TouchEvent) => {
    if (!touch) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.x, dy = t.clientY - touch.y
    touch = null
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) (dx < 0 ? forward : back)()
  }

  /* ---- pieces ---- */
  const common = { ctx, path, settings, messages, refs, dbColor, entryName }
  const startBar = (
    <div class="start-bar">
      <button class={start.kind === 'empty' && path.length === 1 ? 'on' : ''} onClick={() => openStart({ kind: 'empty' })} title="Start again from an empty corner">
        <Flag size={15} /> Empty corner
      </button>
    </div>
  )
  const library = (
    <Library
      ctx={ctx}
      entries={entries}
      current={startLabel}
      commonTags={[...new Set(databases.filter((d) => active.has(d.id)).flatMap((d) => d.commonTags ?? []))]}
      onOpen={(id) => openStart({ kind: 'label', id })}
      extra={edit && <button class="new-entry" onClick={() => setDialog('new-start')}><Plus size={15} /> New start position</button>}
    />
  )
  const modes = (
    <div class="seg modes" role="group" aria-label="Mode">
      {(['explore', 'design', 'find', 'quiz'] as Mode[]).map((m) => (
        <button key={m} class={mode === m ? 'on' : ''} title={m === 'design' ? 'Build and annotate trees of moves' : undefined} onClick={() => { setMode(m); setDrawer(false); setEdit(m === 'design'); setCtxMenu(null) }}>
          {{ explore: 'Explore', design: 'Design', find: 'Find', quiz: 'Quiz' }[m]}
        </button>
      ))}
    </div>
  )
  const editControls = (
    <div class="grp edit-controls">
      <button class={edit ? 'on' : ''} onClick={() => { setEdit(!edit); setMode('explore'); setTool('move'); setPending([]); setRefType(null); setDrawer(false) }} aria-pressed={edit}>
        <Pencil size={15} /> {edit ? 'Editing' : 'Edit'}
      </button>
      {edit && (
        <label class="target">
          <span class="grp-label">into</span>
          <select value={target} onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value
            if (v === '__new') setDialog('new-db')
            else setTarget(v)
          }} aria-label="Database that receives the edits">
            {databases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            <option value="__new">+ New database…</option>
          </select>
        </label>
      )}
      {edit && <button onClick={() => setDialog('keys')} title="Known tags (db/tags.json): how the interface shows and edits a key — type, options, icons, colors. Any other key still works, shown as key: value">Keys…</button>}
      {(edit || nChanges > 0) && (
        <button class={nChanges ? 'changes' : ''} onClick={() => setDialog('export')}>
          <Upload size={15} /> Export{nChanges ? ` (${nChanges})` : ''}
        </button>
      )}
    </div>
  )
  const navButtons = (
    <>
      <button class="icon" disabled={path.length < 2} onClick={toStart} aria-label="Start (Home)"><SkipBack size={18} /></button>
      <button class="icon" disabled={path.length < 2} onClick={back} aria-label="Back (←)"><ChevronLeft size={18} /></button>
      <button class="tenuki" onClick={() => (tenuki ? playCandidate(tenuki) : playFreeMove(null))} title={tenuki ? undefined : 'Pass: play elsewhere'}>
        {tenuki && <CategoryDot cat={tenuki.cat} />}
        Tenuki{!phone && tenuki?.cat ? ` · ${CATEGORIES[tenuki.cat].label}` : ''}
      </button>
      <button class="icon" disabled={!cands.length && !line.future.length} onClick={forward} aria-label="Forward (→)"><ChevronRight size={18} /></button>
      <button class="icon" disabled={!cands.length && !line.future.length} onClick={toEnd} aria-label="End of main line (End)"><SkipForward size={18} /></button>
    </>
  )
  const viewOptions = (
    <div class="view-options">
      <span class="corner-pick" role="group" aria-label="Corner">
        {(['tl', 'tr', 'bl', 'br'] as Corner[]).map((c) => (
          <button key={c} class={settings.display.corner === c ? 'on' : ''} onClick={() => setDisplay({ corner: c })} aria-label={`${{ tl: 'Top-left', tr: 'Top-right', bl: 'Bottom-left', br: 'Bottom-right' }[c]} corner`} title={`Show in the ${{ tl: 'top-left', tr: 'top-right', bl: 'bottom-left', br: 'bottom-right' }[c]} corner`}>
            <span class={`corner-icon c-${c}`} aria-hidden />
          </button>
        ))}
      </span>
      <button class={settings.display.mirror ? 'on' : ''} onClick={() => setDisplay({ mirror: !settings.display.mirror })} title="Mirror the corner along its diagonal"><ArrowLeftRight size={15} /> Mirror</button>
      <button class={settings.display.swap ? 'on' : ''} onClick={() => setDisplay({ swap: !settings.display.swap })} title="Swap Black and White"><Contrast size={15} /> Swap colors</button>
      <button class="icon" onClick={() => setDisplay({ corner: 'tr', mirror: false, swap: false })} title="Show as stored" aria-label="Reset orientation"><RotateCcw size={15} /></button>
      <span class="sep" />
      <button class={settings.view === 'full' ? 'on' : ''} onClick={() => setSettings({ ...settings, view: settings.view === 'full' ? 'corner' : 'full' })}>Full board</button>
      <button class={settings.moveNumbers ? 'on' : ''} onClick={() => setSettings({ ...settings, moveNumbers: !settings.moveNumbers })}>Numbers</button>
      <button class={settings.showNext ? 'on' : ''} onClick={() => setSettings({ ...settings, showNext: !settings.showNext })}>Next moves</button>
    </div>
  )
  const editToolbar = edit && (
    <div class="edit-toolbar">
      <div class="row">
        <span class="grp-label">Draw</span>
        <div class="tools">
          {TOOLS.map(([t, l, help]) => (
            <button key={t} class={tool === t && !refType ? 'on' : ''} title={help} aria-label={help} onClick={() => { setTool(t); setPending([]); setRefType(null) }}>{l}</button>
          ))}
          <button onClick={clearMarks} title="Remove every mark on this position">Clear marks</button>
        </div>
      </div>
      <div class="row">
        <span class="grp-label" title="Insert a link in the text box you clicked last: hovering the words will show the mark">Link text</span>
        <div class="tools">
          {REF_TYPES.map(([t, name]) => (
            <button key={t} class={refType === t ? 'on' : ''} title={`Link words to a ${name.toLowerCase()} on the board`} onClick={() => { setRefType(refType === t ? null : t); setPending([]) }}>{name}</button>
          ))}
          {refType && <button class="on" disabled={!pending.length} onClick={insertRef}>Insert{pending.length ? ` (${pending.length})` : ''}</button>}
        </div>
      </div>
    </div>
  )
  // Tree of moves: mode (linear, proximity, complete) and zoom are remembered (SPEC §8.6).
  // Ahead: the moves you stepped back over; else the last line you saw through here (the trail); else the main line.
  const trailSteps = trail.filter((l) => sameStart(l.start, start)).map((l) => replay(ctx, start, l.moves))
  const fromTrail = (() => {
    for (let k = trailSteps.length - 1; k >= 0; k--) {
      const t = trailSteps[k]
      if (t.length > path.length && path.every((s, i) => t[i].key === s.key)) return rebaseLine(path, t)
    }
    return null
  })()
  // Whatever line is ahead, it goes on to the end along the main move of each position.
  const aheadBase = line.future.length ? line.future : fromTrail ?? []
  const forwardLine = [...aheadBase, ...mainLine(ctx, [...path, ...aheadBase])]
  aheadRef.current = { path, ahead: forwardLine }
  const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.35, 1.6]
  const zoomIdx = Math.max(0, ZOOMS.findIndex((z) => z >= settings.treeZoom - 0.001))
  const setZoom = (d: number) => setSettings({ ...settings, treeZoom: ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, zoomIdx + d))] })
  const modeSeg = (
    <div class="seg" role="group" aria-label="Tree mode">
      {([['linear', 'Linear', 'This line, before and ahead, plus the lines you visited'], ['proximity', 'Proximity', 'Linear plus the other moves from the current position'], ['complete', 'Complete', 'Every move from the start of the line, except hidden branches']] as const).map(([m, name, help]) => (
        <button key={m} class={settings.treeMode === m && !(mode === 'design' && onlyNew) ? 'on' : ''} title={help} aria-pressed={settings.treeMode === m} onClick={() => { setSettings({ ...settings, treeMode: m }); setOnlyNew(false) }}>{name}</button>
      ))}
    </div>
  )
  const aheadSel = (
    <label class="ahead">
      <span class="grp-label">Ahead</span>
      <select value={ahead === null ? 'all' : String(ahead)} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setAhead(v === 'all' ? null : Number(v)) }} aria-label="How many moves after the current one are shown">
        <option value="all">All moves</option>
        <option value="3">Next 3</option>
        <option value="6">Next 6</option>
        <option value="10">Next 10</option>
      </select>
    </label>
  )
  const showHiddenBtn = folded.size > 0 && (
    <button class={showFolded ? 'on' : ''} onClick={() => setShowFolded(!showFolded)} aria-pressed={showFolded} title="Hidden branches are only hidden in this browser">Show hidden ({folded.size})</button>
  )
  const treeToolbar = (
    <div class="tree-toolbar">
      {modeSeg}
      {aheadSel}
      <div class="zoom" role="group" aria-label="Tree size">
        <button class="icon" onClick={() => setZoom(-1)} disabled={zoomIdx === 0} aria-label="Smaller tree">−</button>
        <span class="zoom-val">{Math.round(ZOOMS[zoomIdx] * 100)}%</span>
        <button class="icon" onClick={() => setZoom(1)} disabled={zoomIdx === ZOOMS.length - 1} aria-label="Bigger tree">+</button>
      </div>
      {showHiddenBtn}
    </div>
  )
  /**
   * A line picked in the tree, rebuilt on the current line's steps: where it follows the current line it
   * keeps its orientation (a move can be played mirrored), so the board never flips.
   */
  const onPathFrame = (l: Step[]): Step[] => {
    const shown = [...path, ...forwardLine]
    const out: Step[] = []
    for (let i = 0; i < l.length; i++) {
      if (i < shown.length && shown[i].key === l[i].key && (i === 0 || out[i - 1] === shown[i - 1])) out.push(shown[i])
      else if (i === 0) out.push(l[0])
      else out.push(rebaseLine(out.slice(0, i), l.slice(0, i + 1))[0])
    }
    return out
  }
  /** The tree, from move `root` of the line (Explore: 0). */
  const treeFor = (o: { root: number; zoom: number; labels?: 'coord'; keepChild?: (p: Step, c: Step) => boolean }) => {
    const pre = path.slice(0, o.root)
    const full = (l: Step[]) => [...pre, ...l]
    return (
      <Tree
        ctx={ctx}
        path={path.slice(o.root)}
        forward={o.keepChild ? [] : forwardLine}
        mode={o.keepChild ? 'complete' : settings.treeMode}
        zoom={o.zoom}
        labels={o.labels}
        first={o.root}
        rootParent={o.root > 0 ? path[o.root - 1] : undefined}
        ahead={ahead ?? undefined}
        keepChild={o.keepChild}
        defaultDb={databases[0]?.id ?? ''}
        dbColor={dbColor}
        onSelect={(l0) => {
          const l = onPathFrame(full(l0))
          setCtxMenu(null)
          // Selecting a move ahead on the same line keeps the rest of it for "forward".
          const same = l.length > path.length && l.slice(0, path.length).every((s, i) => s.key === path[i].key)
          if (same) {
            const rest = [...path, ...forwardLine].slice(l.length)
            setLine({ path: l, future: line.future.length ? rest : [] })
            resetMarks()
          } else go(l)
        }}
        extra={(keys) => extraChildren([...pre.map((x) => x.key), ...keys])}
        tagOf={tagOf}
        folded={folded}
        showFolded={showFolded}
        onContext={(l0, x, y) => {
          const l = onPathFrame(full(l0))
          if (mode === 'design') go(l) // Design: the menu edits the selected move
          setCtxMenu({ line: l, x, y })
        }}
      />
    )
  }
  const treeView = treeFor({ root: 0, zoom: ZOOMS[zoomIdx] })
  const treeLegend = (
    <div class="legend">
      <span><MoveMark cat="main" />main move</span>
      <span><MoveMark cat="mistake" />mistake</span>
      <span>⚑ name starts</span>
      <span class="unsaved">◌ dashed: not stored yet</span>
    </div>
  )
  const onOpenLabel = (id: string) => openStart({ kind: 'label', id })
  const editPanel = (
    <EditPanel
      ws={w}
      ctx={ctx}
      path={path}
      target={target}
      commit={commit}
      onFocusText={(el) => (lastText.current = el)}
      onOrder={(children) => orderAt(path, children)}
      onTarget={switchTarget}
      tab={editTab}
      onTab={setEditTab}
      onDeleteMove={() => {
        if (deleteMove(w, path, target)) {
          setLine({ path: path.slice(0, -1), future: [] })
          commit(`Deleted from ${target}`)
        }
      }}
    />
  )
  const nextSide = bothSides ? side : toPlay === -1 ? -1 : 1
  const nextTitle = `Next moves${toPlay || bothSides ? ` · ${nextSide === 1 ? 'Black' : 'White'}` : ''}`
  const lastCat = (() => {
    const p0 = path.length > 1 ? path[path.length - 2] : null
    const c = p0 && step.edge ? candidates(ctx, p0).find((x) => x.edge === step.edge) : undefined
    return c?.cat ? CATEGORIES[c.cat].color : 'var(--line)'
  })()
  const nextMoves = <NextMoves {...common} side={side} setSide={setSide} highlighted={highlighted} onHighlight={setHighlighted} onPlay={playCandidate} />

  /* Left: search, this joseki, evaluation. Right: tree, last move (or edit), next moves. Fixed-size panels. */
  const positionInfo = <PositionInfo {...common} onOpenLabel={onOpenLabel} onCopyLink={(id) => copyLink(linkFor(ctx, { kind: 'label', id }, openPath(ctx, { kind: 'label', id }), { corner: 'tr', mirror: false, swap: false }), entryName(id))} />
  const leftPanel = (
    <aside class="side-panel left" aria-label="Search and joseki information">
      <Stack
        id="explore-left"
        head={startBar}
        items={[
          { id: 'search', title: 'Search positions', icon: <Search size={15} />, weight: 1.3, body: library },
          { id: 'position', title: 'Position', icon: <Grid3x3 size={15} />, weight: 1.6, body: positionInfo },
        ]}
      />
    </aside>
  )
  const rightPanel = (
    <aside class="side-panel right" aria-label="Tree, last move and next moves">
      <Stack
        id="explore-right"
        items={[
          { id: 'tree', title: 'Tree of moves', icon: <GitBranch size={15} />, weight: 1, class: 'tree-card', body: <>{treeToolbar}<div class="tree-box fixed">{treeView}</div>{treeLegend}</> },
          edit
            ? { id: 'edit', title: `Edit · into ${target}`, icon: <Pencil size={15} />, weight: 1.6, class: 'edit-card', body: editPanel }
            : { id: 'last', title: 'Last move', icon: <MessageSquare size={15} />, weight: 0.7, class: 'why', style: { '--cat': lastCat }, body: <LastMove {...common} onGoTo={(n) => go(path.slice(0, n + 1))} /> },
          { id: 'next', title: nextTitle, icon: <ArrowRight size={15} />, weight: 1.1, body: nextMoves },
        ]}
      />
    </aside>
  )

  const status = (
    <div class="title-row status">
      {phone ? (
        <button class="entry-title" onClick={() => setDrawer(true)}>{label ? entryName(label) : offBook ? 'Your own line' : 'Known position'}</button>
      ) : (
        <h2>{label ? <span class="db-ul" style={{ textDecorationColor: dbColor(ctx.graph.entries.get(label)?.contribs[0]?.db ?? '') }} title={`From ${ctx.graph.entries.get(label)?.contribs[0]?.db}`}>{entryName(label)}</span> : offBook ? 'Your own line' : 'Known position'}</h2>
      )}
      {offBook && <span class="offbook-pill">Free play</span>}
      {offBook && firstFree > 0 && <button class="link small" onClick={() => go(path.slice(0, firstFree))}>back to the database</button>}
      {step.free && !step.edge && (
        <button class="link small danger-text" onClick={eraseVariation} title="Erase this move and what follows from the session"><Trash2 size={13} /> erase</button>
      )}
      <button class="icon ghost copy-link" onClick={() => copyLink(linkFor(ctx, start, path, settings.display), 'this position')} title="Copy a link to this position" aria-label="Copy link to this position">
        <Link2 size={15} />
      </button>
      <span class="turn">
        {moveNo ? `Move ${moveNo}: ${lastName}` : 'Start'} · <span class={`stone-ico ${(toPlay || nextSide) === 1 ? 'b' : 'w'}`} aria-hidden />{' '}
        <b>{toPlay === 1 ? 'Black' : toPlay === -1 ? 'White' : bothSides ? (side === 1 ? 'Black' : 'White') : 'Either side'} to play</b>
      </span>
    </div>
  )
  const boardEl = (
    <div class="board-wrap" onTouchStart={edit ? undefined : onTouchStart} onTouchEnd={edit ? undefined : onTouchEnd}>
      <Board
        window={win}
        board={board}
        last={last}
        numbers={settings.moveNumbers ? numbers : null}
        coordinates={settings.coordinates}
        marks={marks}
        onPoint={(pt) => (settling.current ? setTimeout(() => onPointRef.current(pt), 30) : onPoint(pt))}
        pending={pending}
        markers={settings.showNext && !(edit && (tool !== 'move' || refType)) ? cands.filter((c) => c.pt).map((c) => ({
          pt: c.pt!,
          sign: c.sign,
          showColor: false,
          variation: isVariation(ctx, path, c, label),
          cat: c.cat,
          title: `${c.cat ? CATEGORIES[c.cat].label : 'Unclassified'}: ${c.label}`,
          highlight: highlighted === c.step.key,
          onClick: () => playCandidate(c),
        })) : []}
      />
    </div>
  )
  const sideSwitch = bothSides && (
    <div class="seg side-switch" role="group" aria-label="Who plays next">
      <button class={side === 1 ? 'on' : ''} onClick={() => setSide(1)}>● Black plays</button>
      <button class={side === -1 ? 'on' : ''} onClick={() => setSide(-1)}>○ White plays</button>
    </div>
  )

  /* ---- Design tab (SPEC §8.10): board | big tree | info of the selected node ---- */
  // Only new: the moves added since Design was opened, from the position where the first of them starts.
  if (mode === 'design' && !known.current) known.current = new Set([...ctx.graph.nodes.values()].flatMap((n) => n.edges.map((e) => `${n.key}>${e.child}`)))
  if (mode !== 'design') known.current = null
  const isNew = (parent: Step, child: Step) => (!!child.free && !child.edge) || !known.current?.has(`${parent.key}>${child.key}`)
  let newIdx = path.findIndex((s, i) => i > 0 && isNew(path[i - 1], s))
  newIdx = newIdx < 0 ? path.length - 1 : newIdx - 1
  const rootIdx = mode === 'design' && onlyNew ? newIdx : 0
  const prefix = path.slice(0, rootIdx)
  const designZoom = settings.designZoom
  const setDesignZoom = (z: number) => setSettings({ ...settings, designZoom: Math.max(0.5, Math.min(2, Math.round(z * 100) / 100)) })
  const designTree = treeFor({ root: rootIdx, zoom: designZoom, labels: 'coord', keepChild: onlyNew ? isNew : undefined })
  const fitTree = () => {
    const box = document.querySelector('.dtree-canvas') as HTMLElement | null
    const svg = box?.querySelector('svg')
    if (!box || !svg) return
    const natural = Number(svg.getAttribute('width')) / designZoom
    setDesignZoom(Math.min(2, Math.max(0.5, (box.clientWidth - 12) / natural)))
  }
  const toggleFold = (key: string) => {
    const f = new Set(folded)
    f.has(key) ? f.delete(key) : f.add(key)
    setFolded(f)
  }
  const deleteAt = (l: Step[]) => {
    const last = l[l.length - 1]
    if (last.free && !last.edge) {
      setSession(erase(session, start, movesOf(l)))
      setTrail(erase(trail, start, movesOf(l)))
      go(l.slice(0, -1))
      flash('Removed from the session')
    } else setConfirmDelete(l)
  }
  const unsavedCount = unsaved.reduce((n, u) => n + u.steps.filter((x) => x.free && !x.edge).length, 0)
  const cats = MOVE_CATEGORIES
  const ctxLast = ctxMenu ? ctxMenu.line[ctxMenu.line.length - 1] : null
  const ctxIsFree = !!ctxLast?.free && !ctxLast.edge
  const hideItems = ctxMenu && ctxLast && ctxMenu.line.length > 1 && (
    <>
      <button role="menuitem" onClick={() => {
        const hiding = !folded.has(ctxLast.key)
        toggleFold(ctxLast.key)
        // The current line is never hidden: step back to where the hidden branch starts.
        if (hiding && ctxMenu.line.every((s, i) => path[i]?.key === s.key)) go(ctxMenu.line.slice(0, -1))
        setCtxMenu(null)
      }}>{folded.has(ctxLast.key) ? 'Show this branch' : 'Hide this branch'}</button>
      <button role="menuitem" onClick={() => { setTrail(erase(trail, start, movesOf(ctxMenu.line))); setCtxMenu(null); flash('Removed from the trail') }}>Forget this branch (trail)</button>
    </>
  )
  const exploreMenuEl = ctxMenu && ctxLast && (
    <div class="ctx-backdrop" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }}>
      <div class="ctx-menu" role="menu" style={{ left: `${Math.min(ctxMenu.x, window.innerWidth - 260)}px`, top: `${Math.min(ctxMenu.y, window.innerHeight - 200)}px` }} onClick={(e) => e.stopPropagation()}>
        {hideItems}
        {ctxIsFree && (
          <button role="menuitem" class="danger-text" onClick={() => { setSession(erase(session, start, movesOf(ctxMenu.line))); setTrail(erase(trail, start, movesOf(ctxMenu.line))); go(ctxMenu.line.slice(0, -2 + 1)); setCtxMenu(null); flash('Removed: it was not in your databases') }}>Remove this move and what follows</button>
        )}
        <button role="menuitem" onClick={() => { copyLink(linkFor(ctx, start, ctxMenu.line, settings.display), 'this position'); setCtxMenu(null) }}>Copy link</button>
      </div>
    </div>
  )
  const ctxMenuEl = ctxMenu && ctxLast && mode !== 'design' ? exploreMenuEl : ctxMenu && ctxLast && (
    <div class="ctx-backdrop" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }}>
      <div
        class="ctx-menu"
        role="menu"
        style={{ left: `${Math.min(ctxMenu.x, window.innerWidth - 260)}px`, top: `${Math.min(ctxMenu.y, window.innerHeight - 420)}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {ctxMenu.line.length > 1 && (
          <>
            <div class="ctx-h">This move is…</div>
            <div class="ctx-cats">
              {cats.map((c, i) => (
                <button key={c} role="menuitem" title={`${CATEGORIES[c].label} (key ${i + 1})`} onClick={() => { writeAt(ctxMenu.line, 'move', { kind: c }, `Saved as ${CATEGORIES[c].label.toLowerCase()} in ${target}`); setCtxMenu(null) }}>
                  <CategoryDot cat={c} /> {CATEGORIES[c].label}
                </button>
              ))}
            </div>
            <hr />
          </>
        )}
        <button role="menuitem" onClick={() => { writeAt(ctxMenu.line, 'pos', { status: 'end' }, 'Marked as joseki end'); setCtxMenu(null) }}>▣ Mark as joseki end</button>
        <button role="menuitem" onClick={() => { writeAt(ctxMenu.line, 'pos', { status: 'end-mistake' }, 'Marked as end after a mistake'); setCtxMenu(null) }}>▣ Mark as end after a mistake</button>
        <button role="menuitem" onClick={() => { go(ctxMenu.line); setEditTab('pos'); setCtxMenu(null); focusLater('f-pos-status', 'add-tag-pos') }}>Set the result…</button>
        <button role="menuitem" onClick={() => { go(ctxMenu.line); setEditTab('move'); setCtxMenu(null); focusLater('f-move-comment') }}>Edit why…</button>
        <hr />
        <button role="menuitem" onClick={() => { go(ctxMenu.line); setEditTab('pos'); setCtxMenu(null); focusLater('f-name-new', 'f-pos-name') }}>⚑ Name a joseki from here…</button>
        {ctxLast.edge && (
          <button role="menuitem" onClick={() => { makeMain(ctxMenu.line); setCtxMenu(null) }}>Make this the main move</button>
        )}
        <button role="menuitem" onClick={() => { copyLink(linkFor(ctx, start, ctxMenu.line, settings.display), 'this position'); setCtxMenu(null) }}>Copy link</button>
        <hr />
        {hideItems}
        {ctxMenu.line.length > 1 && (
          <button role="menuitem" class="danger-text" onClick={() => { setCtxMenu(null); deleteAt(ctxMenu.line) }}>Delete this move and what follows…</button>
        )}
      </div>
    </div>
  )
  const designControls = (
    <div class="grp edit-controls">
      <label class="target">
        <span class="grp-label">into</span>
        <select value={target} onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value
          if (v === '__new') setDialog('new-db')
          else setTarget(v)
        }} aria-label="Database that receives the edits">
          {databases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="__new">+ New database…</option>
        </select>
      </label>
      <button class={unsavedCount ? 'save-lines' : ''} disabled={!unsavedCount} onClick={() => saveLines(unsaved.map((_, i) => i), target)} title="Store every move of this tree that is only in the browser cache">
        <Save size={15} /> Save to database{unsavedCount ? ` (${unsavedCount})` : ''}
      </button>
      <label class="btn file-btn" title="Add every line of an SGF file to the selected database">
        <FileUp size={15} /> Load SGF
        <input type="file" accept=".sgf,application/x-go-sgf" hidden onChange={async (e) => {
          const input = e.target as HTMLInputElement
          const f = input.files?.[0]
          input.value = ''
          if (!f) return
          try {
            const n = importSgf(w, () => ({ ...ctx!, graph: buildGraph(w.files) }), await f.text(), target)
            commit(`Loaded ${n} move${n === 1 ? '' : 's'} from ${f.name} into ${target}`)
          } catch {
            flash('Could not read this SGF file.')
          }
        }} />
      </label>
      <button onClick={() => download(`${(label ? entryName(label) : 'position').replace(/[^\w\- ]+/g, '').trim() || 'position'}.sgf`, toSgf(ctx, path[path.length - 1]), 'application/x-go-sgf')} title="Download this position and the moves after it as SGF">
        <FileDown size={15} /> SGF
      </button>
      <button onClick={() => setDialog('keys')} title="Known tags (db/tags.json): how the interface shows and edits a key — type, options, icons, colors. Any other key still works, shown as key: value">Keys…</button>
      <button class={nChanges ? 'changes' : ''} onClick={() => setDialog('export')} title="Download a patch or propose the changes on GitHub">
        <Upload size={15} /> Export / pull request{nChanges ? ` (${nChanges})` : ''}
      </button>
    </div>
  )
  const designBoard = (
      <section class="card design-board" aria-label="Board">
        {status}
        {sideSwitch}
        {boardEl}
        <div class="nav">{navButtons}</div>
        {editToolbar}
      </section>
  )
  const designTreeCard = (
      <section class="card design-tree" aria-label="Tree of moves">
        <div class="dtree-bar">
          {modeSeg}
          <button class={onlyNew ? 'on' : ''} aria-pressed={onlyNew} onClick={() => setOnlyNew(!onlyNew)} title="Only the moves added since you opened Design, from the position where they start">Only new</button>
          {aheadSel}
          <div class="zoom" role="group" aria-label="Tree size">
            <button class="icon" onClick={() => setDesignZoom(designZoom - 0.15)} aria-label="Smaller tree">−</button>
            <span class="zoom-val">{Math.round(designZoom * 100)}%</span>
            <button class="icon" onClick={() => setDesignZoom(designZoom + 0.15)} aria-label="Bigger tree">+</button>
            <button onClick={fitTree}>Fit</button>
          </div>
          {showHiddenBtn}
        </div>
        {onlyNew && rootIdx === path.length - 1 && !candidates(ctx, path[path.length - 1]).some((c) => isNew(path[path.length - 1], c.step)) && !extraChildren(path.map((x) => x.key)).length && (
          <p class="hint tree-hint">No new moves here yet: play a move on the board to start one.</p>
        )}
        <div class="dtree-canvas">{designTree}</div>
        <div class="legend">
          <span><MoveMark cat="main" />main move</span>
          <span><MoveMark cat="mistake" />mistake</span>
          <span><MoveMark cat="punish" />punishment</span>
          <span>⚑ name starts</span>
          <span class="unsaved">◌ dashed: only in the browser cache</span>
          <span>+n hidden</span>
          <span>right-click a move for more</span>
        </div>
        <div class="dtree-save">
          <span>⚑ <b>{label ? entryName(label) : 'Unnamed line'}</b> · {unsavedCount ? `${unsavedCount} move${unsavedCount === 1 ? '' : 's'} only in the browser cache` : 'everything stored in the database'}</span>
          <span class="spacer" />
          <button class={unsavedCount ? 'on' : ''} disabled={!unsavedCount} onClick={() => saveLines(unsaved.map((_, i) => i), target)}>Save to {target}</button>
        </div>
      </section>
  )
  const designInfo = (
      <section class="card design-info" aria-label="Selected position">
            <EditPanel
              ws={w}
              ctx={ctx}
              path={path}
              target={target}
                      commit={commit}
              onOrder={(children) => orderAt(path, children)}
      onTarget={switchTarget}
      tab={editTab}
      onTab={setEditTab}
              onFocusText={(el) => (lastText.current = el)}
              onDeleteMove={() => deleteAt(path)}
            />
      </section>
  )
  const design = (
    <>
      <Workbench
        id="design"
        class="design"
        cols={[
          { id: 'board', name: 'board', label: 'Board', width: 430, min: 300, max: 760, node: designBoard },
          { id: 'tree', node: designTreeCard },
          { id: 'info', name: 'info', label: 'Selected move', width: 370, min: 280, max: 640, node: designInfo },
        ]}
      />
      {ctxMenuEl}
      {confirmDelete && (
        <div class="modal" onClick={(e) => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div class="box" role="dialog" aria-label="Delete">
            <h2>Delete from {target}?</h2>
            <p class="text">This removes the move and everything after it from {target}. Moves stored in other databases stay.</p>
            <div class="actions">
              <button onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button class="danger" onClick={() => {
                if (deleteMove(w, confirmDelete, target)) {
                  setLine({ path: confirmDelete.slice(0, -1), future: [] })
                  commit(`Deleted from ${target}`)
                } else flash(`That move is not stored in ${target}.`)
                setConfirmDelete(null)
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  const phoneTabs: [typeof phoneTab, string][] = edit
    ? [['edit', 'Edit'], ['pos', 'Position'], ['next', 'Next'], ['tree', 'Tree']]
    : [['next', 'Next'], ['pos', 'Position'], ['tree', 'Tree']]
  const tab = phoneTabs.some(([t]) => t === phoneTab) ? phoneTab : phoneTabs[0][0]
  const explore = phone ? (
    <>
      <main class="center">
        {status}
        {sideSwitch}
        {boardEl}
        {editToolbar}
        {!edit && (
          <section class="card why" style={{ '--cat': lastCat } as never}>
            <div class="card-body"><LastMove {...common} onGoTo={(n) => go(path.slice(0, n + 1))} /></div>
          </section>
        )}
        <button class={`view-toggle ${viewOpen ? 'on' : ''}`} onClick={() => setViewOpen(!viewOpen)} aria-expanded={viewOpen}><SlidersHorizontal size={15} /> View</button>
        {viewOpen && viewOptions}
      </main>
      <section class="phone-panels">
        <div class="seg phone-tabs" role="tablist">
          {phoneTabs.map(([t, name]) => (
            <button key={t} role="tab" aria-selected={tab === t} class={tab === t ? 'on' : ''} onClick={() => setPhoneTab(t)}>{name}</button>
          ))}
        </div>
        <div class="card"><div class="card-body">
          {tab === 'edit' && editPanel}
          {tab === 'next' && nextMoves}
          {tab === 'pos' && positionInfo}
          {tab === 'tree' && <>{treeToolbar}<div class="tree-box">{treeView}</div>{treeLegend}</>}
        </div></div>
      </section>
      <div class="bottom-bar" role="toolbar" aria-label="Move navigation">{navButtons}</div>
    </>
  ) : (
    <Workbench
      id="explore"
      cols={[
        { id: 'left', name: 'left', label: 'Search · Joseki', width: 300, min: 220, max: 560, node: leftPanel },
        { id: 'center', min: 600, node: <main class="center">{status}{sideSwitch}{boardEl}<div class="nav">{navButtons}</div>{editToolbar}{viewOptions}</main> },
        { id: 'right', name: 'right', label: 'Tree · Moves', width: 390, min: 260, max: 640, node: rightPanel },
      ]}
    />
  )

  return (
    <div class={`layout ${phone ? 'phone' : ''} mode-${mode}`}>
      {mode !== 'design' && ctxMenuEl}
      <header class="top">
        {phone && <button class="icon ghost" onClick={() => setDrawer(true)} aria-label="Open library and menu"><Menu size={20} /></button>}
        <h1><span class="logo" aria-hidden />Baduk Notebook</h1>
        {previewName && <span class="preview-pill" title="Preview of a pull request: changes here do not affect the main site">Preview · {previewName}</span>}
        {!phone && modes}
        {!phone && (
          <div class="grp dbs">
            {databases.map((d) => (
              <label key={d.id} class="layer" title={d.description}>
                <input type="checkbox" checked={active.has(d.id)} onChange={() => toggleDb(d.id)} />
                <span class="swatch" style={{ background: dbColor(d.id) }} />
                {d.name}
              </label>
            ))}
          </div>
        )}
        <span class="spacer" />
        {mode === 'explore' && unsaved.length > 0 && (
          <button class={phone ? 'icon ghost' : 'save-lines'} onClick={() => setDialog('save-lines')} title="Lines you played that are not in your databases yet" aria-label={`Save lines (${unsaved.length})`}>
            <Save size={phone ? 20 : 15} />{!phone && ` Save lines (${unsaved.length})`}
          </button>
        )}
        {!phone && mode === 'explore' && editControls}
        {mode === 'design' && designControls}
        {phone && nChanges > 0 && <button class="icon ghost changes" onClick={() => setDialog('export')} aria-label={`Export ${nChanges} changes`}><Upload size={20} /></button>}
        <button class={phone ? 'icon ghost' : ''} onClick={() => setDialog('settings')} aria-label="Settings"><SettingsIcon size={phone ? 20 : 16} />{!phone && ' Settings'}</button>
      </header>

      {phone && drawer && (
        <div class="drawer-backdrop" onClick={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <nav class="drawer" aria-label="Library and menu">
            <div class="drawer-head">
              <b><BookOpen size={18} /> Menu</b>
              <button class="icon ghost" onClick={() => setDrawer(false)} aria-label="Close"><X size={20} /></button>
            </div>
            {modes}
            {startBar}
            {library}
            <div class="fam">Databases</div>
            {databases.map((d) => (
              <label key={d.id} class="layer wide">
                <input type="checkbox" checked={active.has(d.id)} onChange={() => toggleDb(d.id)} />
                <span class="swatch" style={{ background: dbColor(d.id) }} />
                {d.name}
              </label>
            ))}
            <div class="fam">Editing</div>
            {editControls}
          </nav>
        </div>
      )}

      {mode === 'explore' && explore}
      {mode === 'design' && design}
      {mode === 'find' && (
        <FindMode
          ctx={ctx}
          phone={phone}
          settings={settings}
          entryName={entryName}
          onOpen={(id, keys, display) => {
            setSettings({ ...settings, display })
            const st: Start = { kind: 'label', id }
            const c = { ...ctx, U: userTransform(display) }
            const p = openPath(c, st)
            for (const k of keys.slice(1)) {
              const n = candidates(c, p[p.length - 1]).find((x) => x.step.key === k)
              if (!n) break
              p.push(n.step)
            }
            setStart(st)
            setLine({ path: p, future: [] })
            setMode('explore')
          }}
        />
      )}
      {mode === 'quiz' && <QuizMode ctx={ctx} phone={phone} settings={settings} entryName={entryName} />}

      {dialog === 'keys' && <TagsDialog registry={w.registry} close={() => setDialog(null)} save={(r) => { updateRegistry(w, r); commit('Tags saved in this browser; use Export to propose them') }} />}
      {dialog === 'settings' && <SettingsDialog s={settings} tagKeys={sortKeys([...w.registry.tags.map((d) => d.key), ...w.files.flatMap((f) => f.positions.flatMap((p) => [...Object.keys(p.tags), ...p.moves.flatMap((m) => Object.keys(m.tags))]))])} set={setSettings} close={() => setDialog(null)} databases={databases} active={active} toggleDb={toggleDb} />}
      {dialog === 'export' && (
        <ExportDialog ws={w} close={() => setDialog(null)} onDiscard={async () => {
          await discardDrafts(w)
          commit('All changes discarded')
        }} />
      )}
      {dialog === 'save-lines' && (
        <SaveLinesDialog
          lines={lineViews}
          databases={databases}
          target={target}
          close={() => setDialog(null)}
          save={saveLines}
          erase={(id) => setSession(remove(session, unsaved[id].line))}
        />
      )}
      {dialog === 'new-start' && (
        <NewEntryDialog type={lib} target={target} close={() => setDialog(null)} create={(e) => {
          const err = createEntry(w, target, e)
          if (err) return err
          const g = buildGraph(w.files)
          setGraph(g)
          setVersion(w.version)
          saveDrafts(w)
          const st: Start = { kind: 'label', id: e.id }
          setStart(st)
          setLine({ path: openPath({ ...ctx, graph: g }, st), future: [] })
          flash(`Created ${e.name} in ${target}`)
          return null
        }} />
      )}
      {dialog === 'new-db' && (
        <NewDatabaseDialog count={databases.length} close={() => setDialog(null)} create={(d) => {
          const err = createDatabase(w, d)
          if (err) return err
          setTarget(d.id)
          setSettings({ ...settings, activeDatabases: [...(settings.activeDatabases ?? [...active]), d.id] })
          saveDrafts(w)
          setVersion(w.version)
          flash(`Created database ${d.name}. Edits now go there.`)
          return null
        }} />
      )}
      {toast && <div class="toast" role="status">{toast}</div>}
    </div>
  )
}

/** Follows the best next move while it is a good one, so End never walks into a mistake. */
/**
 * Continues `path` with the steps of `source` after it (`source` starts with the same positions).
 * Each step keeps its orientation relative to its parent, so the board does not flip.
 */
function rebaseLine(path: Step[], source: Step[]): Step[] {
  const out = [...path]
  for (let i = path.length; i < source.length; i++) {
    const rel = compose(inverse(source[i - 1].D), source[i].D)
    out.push({ ...source[i], D: compose(out[i - 1].D, rel) })
  }
  return out.slice(path.length)
}

