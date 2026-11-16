import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  ArrowLeftRight, BookOpen, ChevronLeft, ChevronRight, Contrast, Menu, Pencil, Plus, RotateCcw,
  Settings as SettingsIcon, SkipBack, SkipForward, SlidersHorizontal, Upload, X,
} from 'lucide-preact'
import { loadDatabases, type DatabaseInfo } from './data/load'
import { buildGraph, type Graph } from './core/graph'
import { CATEGORIES, JOSEKI_CATEGORIES, SHAPE_CATEGORIES } from './core/fields'
import { apply, applySign, compose, cornerWindow, inverse, parseSgfPtList, ptName, userTransform, type Corner, type Pt, type Sign } from './core/geometry'
import type { Mark } from './core/refs'
import { applyTheme, loadSettings, saveSettings, type Settings } from './settings'
import { candidates, displayBoard, frame, entryFields, inBook, moveOf, playFree, positionFields, rebaseLine, rootStep, toMove, type Ctx, type Step } from './view'
import { collectMessages } from './messages'
import { Board } from './ui/Board'
import { Tree } from './ui/Tree'
import { InfoPanel, CategoryDot } from './ui/InfoPanel'
import { Message } from './ui/Message'
import { Rich, type RefHandlers } from './ui/Rich'
import { SettingsDialog } from './ui/SettingsDialog'
import { Library } from './ui/Library'
import { useMedia } from './ui/useMedia'
import { EditPanel } from './ui/EditPanel'
import { ExportDialog, NewDatabaseDialog, NewEntryDialog } from './ui/Dialogs'
import { FindMode } from './ui/FindMode'
import { QuizMode } from './ui/QuizMode'
import { changeCount, createWorkspace, discardDrafts, restoreDrafts, saveDrafts, type Workspace } from './edit/workspace'
import { addMove, checkMove, createDatabase, createEntry, deleteMove, describePosition, locate, setProps } from './edit/ops'
import { sgfPoint } from './edit/sgfio'

// Distinct colors for "always show" references (SPEC §11.2).
const REF_PALETTE = ['#d81b60', '#1e88e5', '#00897b', '#f4511e', '#8e24aa', '#6d4c41', '#3949ab', '#c0ca33']

type Mode = 'explore' | 'find' | 'quiz'
type Tool = 'move' | 'TR' | 'SQ' | 'CR' | 'MA' | 'LB' | 'XCUT' | 'XWALL' | 'XINF' | 'AR' | 'AB' | 'AW' | 'AE'
const TOOLS: [Tool, string][] = [
  ['move', 'Play'], ['TR', '△'], ['SQ', '□'], ['CR', '○'], ['MA', '✕'], ['LB', 'A'], ['XCUT', 'Cut'],
  ['XWALL', 'Wall'], ['XINF', 'Influence'], ['AR', 'Arrow'], ['AB', '● stone'], ['AW', '○ stone'], ['AE', 'Erase stone'],
]
const PAIR_TOOLS = new Set<Tool>(['XWALL', 'XINF', 'AR'])
const SETUP_TOOLS = new Set<Tool>(['AB', 'AW', 'AE'])
const REF_TYPES = ['TR', 'SQ', 'CR', 'MA', 'CUT', 'WALL', 'INF', 'AR'] as const

/** Rebuilds a line by position keys on a (new) graph. */
function rebase(ctx: Ctx, entryId: string, keys: string[]): Step[] {
  if (!ctx.graph.entries.has(entryId)) return []
  const out = [rootStep(ctx, entryId)]
  for (const k of keys.slice(1)) {
    const c = candidates(ctx, out[out.length - 1]).find((c) => c.step.key === k)
    if (!c) break
    out.push(c.step)
  }
  return out
}

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
  const [entryId, setEntryId] = useState<string | null>(null)
  const [line, setLine] = useState<{ path: Step[]; future: Step[] }>({ path: [], future: [] })
  const path = line.path
  /** Replaces the line; the moves after it are forgotten unless `keepFuture`. */
  const setPath = (p: Step[] | ((old: Step[]) => Step[])) =>
    setLine((l) => ({ path: typeof p === 'function' ? p(l.path) : p, future: [] }))
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | 'settings' | 'export' | 'new-entry' | 'new-db'>(null)
  const [edit, setEdit] = useState(false)
  const [target, setTarget] = useState<string>('')
  const [playAs, setPlayAs] = useState<'auto' | 'B' | 'W'>('auto')
  const [tool, setTool] = useState<Tool>('move')
  const [pending, setPending] = useState<Pt[]>([])
  const [refType, setRefType] = useState<(typeof REF_TYPES)[number] | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const lastText = useRef<HTMLTextAreaElement | null>(null)
  const phone = useMedia('(max-width: 700px)')

  const setSettings = (s: Settings) => {
    setSettingsState(s)
    saveSettings(s)
  }
  useEffect(() => applyTheme(settings), [settings.theme, settings.colorMode])

  useEffect(() => {
    loadDatabases()
      .then(async ({ databases, texts }) => {
        const w = createWorkspace(databases, texts)
        const restored = await restoreDrafts(w)
        ws.current = w
        setGraph(buildGraph(w.files))
        setTarget(w.databases[w.databases.length - 1]?.id ?? '')
        if (restored) setToast(`Restored ${restored} unsaved change${restored > 1 ? 's' : ''} from this browser.`)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])
  const flash = (m: string) => setToast(m)

  const databases: DatabaseInfo[] = ws.current?.databases ?? []
  const active = useMemo(
    () => new Set(settings.activeDatabases ?? databases.filter((d) => d.activeByDefault).map((d) => d.id)),
    [settings.activeDatabases, databases],
  )
  // The database being edited is always shown.
  const shown = useMemo(() => (edit && target ? new Set([...active, target]) : active), [active, edit, target])
  const ctx: Ctx | null = graph
    ? { graph, active: shown, order: databases.map((d) => d.id), U: userTransform(settings.display) }
    : null
  const dbColor = (id: string) => databases.find((d) => d.id === id)?.color ?? '#888'
  const entries = graph ? [...graph.entries.values()].filter((e) => e.contribs.some((c) => shown.has(c.db))) : []
  const entryName = (id: string) => (ctx && ctx.graph.entries.has(id) ? entryFields(ctx, id, rootStep(ctx, id)).one('XNAME')?.value ?? id : id)

  const toggleDb = (id: string) => {
    const next = new Set(active)
    next.has(id) ? next.delete(id) : next.add(id)
    setSettings({ ...settings, activeDatabases: databases.map((d) => d.id).filter((d) => next.has(d)) })
  }

  // Open the first entry once loaded; keep the line valid when databases change.
  useEffect(() => {
    if (!ctx) return
    if (!entryId || !entries.some((e) => e.id === entryId)) {
      const first = entries.find((e) => e.type === lib) ?? entries[0]
      if (first) open(first.id)
      return
    }
    const fresh = rebaseLine(ctx, entryId, path)
    if (fresh.length !== path.length || fresh.some((s, i) => s.key !== path[i].key || s.edge !== path[i].edge)) setLine((l) => ({ path: fresh, future: l.future }))
  }, [graph, shown])

  function open(id: string, keys?: string[]) {
    if (!ctx) return
    setEntryId(id)
    setPath(keys ? rebase(ctx, id, keys) : [rootStep(ctx, id)])
    setPinned(null)
    setDrawer(false)
    setPending([])
  }
  const go = (p: Step[]) => {
    setPath(p)
    setPinned(null)
    setHovered(null)
    setPending([])
  }
  const resetMarks = () => {
    setPinned(null)
    setHovered(null)
    setPending([])
  }
  // Back and forward keep the moves you step back over, in or out of the database (SPEC §8.3).
  const back = () => {
    resetMarks()
    setLine((l) => (l.path.length > 1 ? { path: l.path.slice(0, -1), future: [l.path[l.path.length - 1], ...l.future] } : l))
  }
  const forward = () => {
    resetMarks()
    setLine((l) => {
      if (!ctx || !l.path.length) return l
      if (l.future.length) return { path: [...l.path, l.future[0]], future: l.future.slice(1) }
      const c = candidates(ctx, l.path[l.path.length - 1])[0]
      return c ? { path: [...l.path, c.step], future: [] } : l
    })
  }
  const toStart = () => {
    resetMarks()
    setLine((l) => ({ path: l.path.slice(0, 1), future: [...l.path.slice(1), ...l.future] }))
  }
  const toEnd = () => {
    resetMarks()
    setLine((l) => {
      if (!ctx) return l
      if (l.future.length) return { path: [...l.path, ...l.future], future: [] }
      return { path: mainLineEnd(ctx, l.path), future: [] }
    })
  }

  /** After an edit: rebuild the graph, keep the line, save drafts. */
  const commit = (msg?: string, adjust?: (c: Ctx, p: Step[]) => Step[] | null) => {
    const w = ws.current!
    const g = buildGraph(w.files)
    const c: Ctx = { graph: g, active: shown, order: w.databases.map((d) => d.id), U: userTransform(settings.display) }
    let p = entryId ? rebaseLine(c, entryId, path) : []
    if (adjust) p = adjust(c, p) ?? p
    setGraph(g)
    setPath(p)
    setVersion(w.version)
    saveDrafts(w)
    if (msg) flash(msg)
  }

  // Keyboard: navigation, and the fast entry keys in edit mode (SPEC §10.1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (/INPUT|SELECT|TEXTAREA/.test(el.tagName)) {
        if (e.key === 'Escape') el.blur()
        return
      }
      if (!ctx || mode !== 'explore' || dialog) return
      const nav: Record<string, () => void> = { ArrowLeft: back, ArrowRight: forward, Home: toStart, End: toEnd }
      if (nav[e.key]) {
        e.preventDefault()
        nav[e.key]()
        return
      }
      if (!edit || e.ctrlKey || e.metaKey || e.altKey) return
      const entry = entryId ? ctx.graph.entries.get(entryId) : null
      const cats = entry?.type === 'shape' ? SHAPE_CATEGORIES : JOSEKI_CATEGORIES
      const k = e.key.toLowerCase()
      const styles: Record<string, string> = { a: 'aggressive', b: 'balanced', s: 'solid' }
      if (/^[1-8]$/.test(k) && path.length > 1 && cats[Number(k) - 1]) {
        writeNode({ XCAT: [cats[Number(k) - 1]] }, `Category: ${CATEGORIES[cats[Number(k) - 1]].label}`)
      } else if (styles[k]) {
        if (path.length > 1) writeNode({ XSTY: [styles[k]] }, `Style: ${styles[k]}`)
      } else if (k === 'p') {
        playMove(null)
      } else if (e.key === 'Enter') {
        document.getElementById('f-node-XMW')?.focus()
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error) return <div class="pane error-box">Could not load the databases: {error}</div>
  if (!ctx || !ws.current) return <div class="pane loading">Loading databases…</div>
  const w = ws.current
  if (!entryId || !path.length) {
    return (
      <div class="pane loading">
        No entries in the active databases. <button onClick={() => setDialog('settings')}>Settings</button>
        {dialog === 'settings' && <SettingsDialog s={settings} set={setSettings} close={() => setDialog(null)} databases={databases} active={active} toggleDb={toggleDb} />}
      </div>
    )
  }

  const step = path[path.length - 1]
  const F = frame(ctx, step)
  const board = displayBoard(ctx, step)
  const entry = graph!.entries.get(entryId)!
  const win: [number, number, number, number] = settings.view === 'full' ? [0, 18, 0, 18] : cornerWindow(settings.display.corner)
  const toPlay = toMove(ctx, step)

  /* ---- editing ---- */
  function writeNode(values: Record<string, string[] | null>, msg?: string) {
    const loc = locate(w, ctx!, path, target, entryId!, true)!
    if (values.XCAT) {
      const c = values.XCAT[0]
      Object.assign(values, {
        TE: ['main', 'alt', 'punish', 'correct'].includes(c) ? ['1'] : null,
        BM: ['mistake', 'overplay', 'wrong'].includes(c) ? ['1'] : null,
        DO: c === 'slack' ? [''] : null,
        IT: ['situational', 'trick'].includes(c) ? [''] : null,
      })
    }
    setProps(w, loc, values)
    commit(msg)
  }

  function playMove(pt: Pt | null) {
    const sign: Sign = playAs === 'B' ? 1 : playAs === 'W' ? -1 : toPlay || 1
    const check = checkMove(ctx!, path, sign, pt)
    if (!check.ok) return flash(check.reason)
    const existing = candidates(ctx!, step).find((c) => c.sign === sign && (pt ? c.pt && c.pt[0] === pt[0] && c.pt[1] === pt[1] : !c.pt))
    if (existing && existing.dbs.includes(target)) return go([...path, existing.step])
    const { canonPt, canonSign } = addMove(w, ctx!, path, target, entryId!, sign, pt)
    let joined: string | null = null
    commit(undefined, (c, p) => {
      const cand = candidates(c, p[p.length - 1]).find(
        (x) => x.edge.sign === canonSign && (canonPt ? x.edge.pt && x.edge.pt[0] === canonPt[0] && x.edge.pt[1] === canonPt[1] : !x.edge.pt),
      )
      if (!cand) return null
      if (check.joins) joined = describePosition(c.graph, cand.step.key)
      return [...p, cand.step]
    })
    flash(joined ? `Joins an existing position: ${joined}` : `Added ${sign === 1 ? 'Black' : 'White'} ${pt ? ptName(pt) : 'tenuki'} to ${target}`)
  }

  /** Plays a move that may not be in any database (SPEC §8.3 free play). */
  function playFreeMove(pt: Pt | null) {
    const sign: Sign = toPlay || (lastSign ? (-lastSign as Sign) : 1)
    const check = checkMove(ctx!, path, sign, pt)
    if (!check.ok) return flash(check.reason)
    const next = playFree(ctx!, step, sign, pt)
    const fut = line.future[0]
    const same = fut && fut.key === next.key
    setLine({ path: [...path, next], future: same ? line.future.slice(1) : [] })
    resetMarks()
    if (inBook(ctx!, step) && !inBook(ctx!, next)) flash('Out of the database. Keep playing, or save this line.')
    else if (!inBook(ctx!, step) && inBook(ctx!, next)) flash('Back in a known position.')
  }

  function saveLine() {
    locate(w, ctx!, path, target, entryId!, true)
    commit(`Saved this line to ${target}`)
  }

  function onPoint(pt: Pt) {
    if (!edit) return playFreeMove(pt)
    if (refType) return setPending([...pending, pt])
    if (tool === 'move') return playMove(pt)
    const setup = SETUP_TOOLS.has(tool)
    if (setup && path.length > 1) return flash('Set-up stones can only be changed at the start position.')
    const loc = locate(w, ctx!, setup ? path.slice(0, 1) : path, target, entryId!, true)!
    const toDisplay = compose(setup ? frame(ctx!, path[0]) : F, loc.T)
    const sp = sgfPoint(apply(inverse(toDisplay), pt))
    const d = loc.node.data
    if (setup) {
      const strip = (k: string) => (d[k] ?? []).flatMap(parseSgfPtList).map(sgfPoint).filter((x) => x !== sp)
      const update: Record<string, string[] | null> = { AB: strip('AB'), AW: strip('AW'), AE: strip('AE') }
      const real = tool === 'AE' ? 'AE' : (tool === 'AB') !== toDisplay.swap ? 'AB' : 'AW'
      update[real] = [...(update[real] ?? []), sp]
      setProps(w, loc, update)
      return commit()
    }
    if (PAIR_TOOLS.has(tool)) {
      if (!pending.length) return setPending([pt])
      const first = sgfPoint(apply(inverse(toDisplay), pending[0]))
      setPending([])
      setProps(w, loc, { [tool]: [...(d[tool] ?? []), `${first}:${sp}`] })
      return commit()
    }
    if (tool === 'LB') {
      const vals = d.LB ?? []
      const has = vals.find((v) => v.startsWith(sp + ':'))
      setProps(w, loc, { LB: has ? vals.filter((v) => v !== has) : [...vals, `${sp}:${String.fromCharCode(65 + vals.length)}`] })
      return commit()
    }
    const list = (d[tool] ?? []).flatMap(parseSgfPtList).map(sgfPoint)
    setProps(w, loc, { [tool]: list.includes(sp) ? list.filter((x) => x !== sp) : [...list, sp] })
    commit()
  }

  function insertRef() {
    if (!refType || !pending.length) return
    const ta = lastText.current
    if (!ta || !document.body.contains(ta)) return flash('Click in a text box first, then pick the points.')
    const loc = locate(w, ctx!, path, target, entryId!, true)!
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
    const loc = locate(w, ctx!, path, target, entryId!, false)
    if (!loc) return
    setProps(w, loc, Object.fromEntries(['TR', 'SQ', 'CR', 'MA', 'LB', 'XCUT', 'XWALL', 'XINF', 'AR', 'LN', 'XTB', 'XTW'].map((k) => [k, null])))
    commit('Marks cleared on this position')
  }

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
  const cands = candidates(ctx, step).filter((c) => !c.cat || !settings.hiddenCategories.includes(c.cat))
  const tenuki = cands.find((c) => !c.pt)

  const messages = collectMessages(ctx, path, settings)
  const refMarks = new Map<string, Mark[]>()
  for (const m of messages) for (const s of m.segments) if ('ref' in s) refMarks.set(s.id, s.ref)
  const ef = entryFields(ctx, entryId, path[0])
  for (const prop of ['XSUM', 'XRULE']) for (const t of ef.text(prop)) for (const s of t.segments) if ('ref' in s) refMarks.set(s.id, s.ref)
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

  const callout = messages.filter((m) => m.place === 'callout')
  const offBook = !inBook(ctx, step)
  const firstFree = path.findIndex((s) => !inBook(ctx, s))
  const freeCount = path.filter((s) => s.free && !s.edge).length
  // The most specific entry along the line (e.g. "Empty corner" → "4-4 point · 3-3 invasion").
  let shownIdx = 0
  path.forEach((s, i) => {
    if (i > 0 && inBook(ctx, s) && entries.some((e) => e.root === s.key && e.id !== entryId)) shownIdx = i
  })
  const shownEntry = shownIdx ? entries.find((e) => e.root === path[shownIdx].key && e.id !== entryId)!.id : entryId
  const moveNo = path.length - 1
  const lastMove = moveOf(step)
  const lastSign = lastMove ? applySign(frame(ctx, path[path.length - 2]), lastMove.sign) : 0
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
  const newEntryButton = edit && (
    <button class="new-entry" onClick={() => setDialog('new-entry')}><Plus size={15} /> New {lib === 'joseki' ? 'joseki' : 'shape'}</button>
  )
  const library = <Library ctx={ctx} entries={entries} current={entryId} lib={lib} setLib={setLib} onOpen={(id) => open(id)} extra={newEntryButton} />
  const modes = (
    <div class="seg modes" role="group" aria-label="Mode">
      {(['explore', 'find', 'quiz'] as Mode[]).map((m) => (
        <button key={m} class={mode === m ? 'on' : ''} onClick={() => { setMode(m); setDrawer(false); if (m !== 'explore') setEdit(false) }}>
          {{ explore: 'Explore', find: 'Find', quiz: 'Quiz' }[m]}
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
      {edit ? (
        <button class="tenuki" onClick={() => playMove(null)}>+ Tenuki</button>
      ) : (
        <button class="tenuki" onClick={() => (tenuki ? go([...path, tenuki.step]) : playFreeMove(null))} title={tenuki ? undefined : 'Pass: not in the database'}>
          {tenuki && <CategoryDot cat={tenuki.cat} />}
          Tenuki{!phone && tenuki?.cat ? ` · ${CATEGORIES[tenuki.cat].label}` : ''}
        </button>
      )}
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
      <button class={settings.display.mirror ? 'on' : ''} onClick={() => setDisplay({ mirror: !settings.display.mirror })} title="Mirror the corner along its diagonal">
        <ArrowLeftRight size={15} /> Mirror
      </button>
      <button class={settings.display.swap ? 'on' : ''} onClick={() => setDisplay({ swap: !settings.display.swap })} title="Swap Black and White">
        <Contrast size={15} /> Swap colors
      </button>
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
        <span class="grp-label">Tool</span>
        <div class="tools">
          {TOOLS.map(([t, l]) => (
            <button key={t} class={tool === t && !refType ? 'on' : ''} onClick={() => { setTool(t); setPending([]); setRefType(null) }}>{l}</button>
          ))}
        </div>
      </div>
      <div class="row">
        <span class="grp-label">Play as</span>
        <div class="seg">
          {(['auto', 'B', 'W'] as const).map((c) => (
            <button key={c} class={playAs === c ? 'on' : ''} onClick={() => setPlayAs(c)}>{{ auto: 'Auto', B: 'Black', W: 'White' }[c]}</button>
          ))}
        </div>
        <button onClick={clearMarks}>Clear marks</button>
      </div>
      <div class="row">
        <span class="grp-label">Link text</span>
        <div class="tools">
          {REF_TYPES.map((t) => (
            <button key={t} class={refType === t ? 'on' : ''} onClick={() => { setRefType(refType === t ? null : t); setPending([]) }}>{t}</button>
          ))}
        </div>
        {refType && <button class="on" disabled={!pending.length} onClick={insertRef}>Insert{pending.length ? ` (${pending.length})` : ''}</button>}
      </div>
      <p class="hint">
        {refType
          ? 'Select words in a text box (optional), click points on the board, then Insert.'
          : tool === 'move'
            ? `Click an empty point to add a move to ${target}. Colored markers follow existing moves.`
            : PAIR_TOOLS.has(tool)
              ? pending.length ? 'Now click the end point.' : 'Click the start point.'
              : SETUP_TOOLS.has(tool)
                ? 'Click points to place or remove set-up stones (start position only).'
                : 'Click points to add or remove the mark on this position.'}
      </p>
    </div>
  )

  const explore = (
    <>
      {!phone && <aside class="pane left">{library}</aside>}
      <main class="pane center">
        <div class="status">
          {phone ? (
            <button class="entry-title" onClick={() => setDrawer(true)}>{entryName(shownEntry)}</button>
          ) : (
            <span>{entryName(shownEntry)} · </span>
          )}
          {offBook && <span class="offbook-pill">Free play</span>}
          <span>{moveNo ? `Move ${moveNo}: ${lastName}` : 'Start position'} · <b>{toPlay === 1 ? 'Black' : toPlay === -1 ? 'White' : 'Either side'} to play</b></span>
        </div>
        <div class="board-wrap" onTouchStart={edit ? undefined : onTouchStart} onTouchEnd={edit ? undefined : onTouchEnd}>
          <Board
            window={win}
            board={board}
            last={last}
            numbers={settings.moveNumbers ? numbers : null}
            coordinates={settings.coordinates}
            marks={marks}
            onPoint={onPoint}
            pending={pending}
            markers={settings.showNext && !(edit && (tool !== 'move' || refType)) ? cands.filter((c) => c.pt).map((c) => ({
              pt: c.pt!,
              sign: c.sign,
              showColor: toPlay === 0,
              cat: c.cat,
              title: `${c.cat ? CATEGORIES[c.cat].label : 'Unclassified'}: ${c.label}`,
              highlight: highlighted === c.step.key,
              onClick: () => go([...path, c.step]),
            })) : []}
          />
        </div>
        {!phone && <div class="nav">{navButtons}</div>}
        {editToolbar}
        {phone ? (
          <>
            <button class={`view-toggle ${viewOpen ? 'on' : ''}`} onClick={() => setViewOpen(!viewOpen)} aria-expanded={viewOpen}>
              <SlidersHorizontal size={15} /> View
            </button>
            {viewOpen && viewOptions}
          </>
        ) : (
          viewOptions
        )}
        {!edit && callout.map((m, i) => (
          <Message key={i} kind="move" title={m.title} db={m.db} dbColor={dbColor(m.db)} callout>
            <Rich segments={m.segments} h={refs} />
          </Message>
        ))}
      </main>
      <aside class="pane right">
        {edit ? (
          <EditPanel
            ws={w}
            ctx={ctx}
            path={path}
            entryId={entryId}
            target={target}
            commit={commit}
            onFocusText={(el) => (lastText.current = el)}
            onDeleteMove={() => {
              if (deleteMove(w, path, target)) {
                const keys = path.slice(0, -1).map((s) => s.key)
                commit(`Deleted from ${target}`, (c) => rebase(c, entryId, keys))
              }
            }}
          />
        ) : (
          <>
            {offBook && (
              <div class="offbook">
                <h3>Out of the database</h3>
                <p class="text">
                  {freeCount} move{freeCount === 1 ? '' : 's'} played freely {firstFree > 1 ? `after move ${firstFree - 1}` : 'from the start'}. Messages and next moves come back when the line reaches a known position.
                </p>
                <div class="grp">
                  <button onClick={() => go(path.slice(0, firstFree))}>Back to the database</button>
                  <label class="target">
                    <span class="grp-label">Save to</span>
                    <select value={target} onChange={(e) => setTarget((e.target as HTMLSelectElement).value)} aria-label="Database to save this line to">
                      {databases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                  <button class="on" onClick={saveLine}>Save this line</button>
                </div>
              </div>
            )}
            <InfoPanel ctx={ctx} entryId={shownEntry} path={path.slice(shownIdx)} settings={settings} messages={messages} refs={refs} dbColor={dbColor} highlighted={highlighted} onHighlight={setHighlighted} onGo={(p) => go([...path.slice(0, shownIdx), ...p])} />
          </>
        )}
      </aside>
      <section class="pane tree">
        <h2>Variation tree</h2>
        <div class="tree-box">
          <Tree ctx={ctx} root={path[0]} path={path} defaultDb={databases[0]?.id ?? ''} onSelect={go} />
        </div>
        <div class="legend">
          {(entry.type === 'joseki' ? JOSEKI_CATEGORIES : SHAPE_CATEGORIES).map((c) => (
            <span key={c}><CategoryDot cat={c} />{CATEGORIES[c].label}</span>
          ))}
          <span>T = tenuki</span>
          <span>⇄ = joins a position shown elsewhere</span>
          <span><span class="dot" style={{ background: 'var(--db-extra)' }} />only in another database</span>
        </div>
      </section>
      {phone && <div class="bottom-bar" role="toolbar" aria-label="Move navigation">{navButtons}</div>}
    </>
  )

  return (
    <div class={`layout ${phone ? 'phone' : ''} mode-${mode}`}>
      <header class="top">
        {phone && <button class="icon ghost" onClick={() => setDrawer(true)} aria-label="Open library and menu"><Menu size={20} /></button>}
        <h1><span class="logo" aria-hidden />Baduk Notebook</h1>
        {!phone && modes}
        {!phone && (
          <div class="grp dbs">
            {databases.map((d) => (
              <label key={d.id} class="layer" title={d.description}>
                <input type="checkbox" checked={active.has(d.id)} onChange={() => toggleDb(d.id)} />
                <span class="swatch" style={{ background: d.color }} />
                {d.name}
              </label>
            ))}
          </div>
        )}
        <span class="spacer" />
        {!phone && mode === 'explore' && editControls}
        {phone && nChanges > 0 && <button class="icon ghost changes" onClick={() => setDialog('export')} aria-label={`Export ${nChanges} changes`}><Upload size={20} /></button>}
        <button class={phone ? 'icon ghost' : ''} onClick={() => setDialog('settings')} aria-label="Settings"><SettingsIcon size={phone ? 20 : 16} />{!phone && ' Settings'}</button>
      </header>

      {phone && drawer && (
        <div class="drawer-backdrop" onClick={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <nav class="drawer" aria-label="Library and menu">
            <div class="drawer-head">
              <b><BookOpen size={18} /> Library</b>
              <button class="icon ghost" onClick={() => setDrawer(false)} aria-label="Close"><X size={20} /></button>
            </div>
            {modes}
            {library}
            <div class="fam">Databases</div>
            {databases.map((d) => (
              <label key={d.id} class="layer wide">
                <input type="checkbox" checked={active.has(d.id)} onChange={() => toggleDb(d.id)} />
                <span class="swatch" style={{ background: d.color }} />
                {d.name}
              </label>
            ))}
            <div class="fam">Editing</div>
            {editControls}
          </nav>
        </div>
      )}

      {mode === 'explore' && explore}
      {mode === 'find' && (
        <FindMode
          ctx={ctx}
          phone={phone}
          settings={settings}
          entryName={entryName}
          onOpen={(id, keys, display) => {
            setSettings({ ...settings, display })
            open(id, keys)
            setMode('explore')
          }}
        />
      )}
      {mode === 'quiz' && <QuizMode ctx={ctx} phone={phone} settings={settings} entryName={entryName} />}

      {dialog === 'settings' && (
        <SettingsDialog s={settings} set={setSettings} close={() => setDialog(null)} databases={databases} active={active} toggleDb={toggleDb} />
      )}
      {dialog === 'export' && (
        <ExportDialog ws={w} close={() => setDialog(null)} onDiscard={async () => {
          await discardDrafts(w)
          commit('All changes discarded')
        }} />
      )}
      {dialog === 'new-entry' && (
        <NewEntryDialog type={lib} target={target} close={() => setDialog(null)} create={(e) => {
          const err = createEntry(w, target, e)
          if (err) return err
          const g = buildGraph(w.files)
          setGraph(g)
          setVersion(w.version)
          saveDrafts(w)
          setEntryId(e.id)
          setPath([rootStep({ ...ctx, graph: g }, e.id)])
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
function mainLineEnd(ctx: Ctx, path: Step[]): Step[] {
  const out = [...path]
  const seen = new Set(out.map((s) => s.key))
  for (;;) {
    const c = candidates(ctx, out[out.length - 1])[0]
    if (!c || seen.has(c.step.key) || (c.cat && !CATEGORIES[c.cat].good)) return out
    seen.add(c.step.key)
    out.push(c.step)
  }
}
