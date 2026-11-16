import { useEffect, useMemo, useState } from 'preact/hooks'
import { ArrowLeftRight, ChevronLeft, ChevronRight, Contrast, RotateCcw, Settings as SettingsIcon, SkipBack, SkipForward } from 'lucide-preact'
import { loadDatabases, type DatabaseInfo } from './data/load'
import { buildGraph, type Graph } from './core/graph'
import { CATEGORIES } from './core/fields'
import { apply, applySign, cornerWindow, ptName, userTransform, type Corner, type Pt } from './core/geometry'
import type { Mark } from './core/refs'
import { loadSettings, saveSettings, type Settings } from './settings'
import { candidates, displayBoard, frame, entryFields, positionFields, rootStep, toMove, type Ctx, type Step } from './view'
import { collectMessages } from './messages'
import { Board } from './ui/Board'
import { Tree } from './ui/Tree'
import { InfoPanel, CategoryDot } from './ui/InfoPanel'
import { Message } from './ui/Message'
import { Rich, type RefHandlers } from './ui/Rich'
import { SettingsDialog } from './ui/SettingsDialog'

// Distinct colors for "always show" references (SPEC §11.2).
const REF_PALETTE = ['#d81b60', '#1e88e5', '#00897b', '#f4511e', '#8e24aa', '#6d4c41', '#3949ab', '#c0ca33']

export function App() {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettingsState] = useState<Settings>(loadSettings)
  const [lib, setLib] = useState<'joseki' | 'shape'>('joseki')
  const [query, setQuery] = useState('')
  const [entryId, setEntryId] = useState<string | null>(null)
  const [path, setPath] = useState<Step[]>([])
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const setSettings = (s: Settings) => {
    setSettingsState(s)
    saveSettings(s)
  }

  useEffect(() => {
    loadDatabases()
      .then(({ databases, files }) => {
        setDatabases(databases)
        setGraph(buildGraph(files))
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const active = useMemo(
    () => new Set(settings.activeDatabases ?? databases.filter((d) => d.activeByDefault).map((d) => d.id)),
    [settings.activeDatabases, databases],
  )
  const ctx: Ctx | null = graph
    ? { graph, active, order: databases.map((d) => d.id), U: userTransform(settings.display) }
    : null
  const dbColor = (id: string) => databases.find((d) => d.id === id)?.color ?? '#888'

  const entries = graph
    ? [...graph.entries.values()].filter((e) => e.contribs.some((c) => active.has(c.db)))
    : []
  const entryName = (id: string) => (ctx ? entryFields(ctx, id, rootStep(ctx, id)).one('XNAME')?.value ?? id : id)

  // Open the first entry once loaded; keep the path valid when databases are switched off.
  useEffect(() => {
    if (!ctx) return
    if (!entryId || !entries.some((e) => e.id === entryId)) {
      const first = entries.find((e) => e.type === lib) ?? entries[0]
      if (first) open(first.id)
      return
    }
    const ok: Step[] = [path[0]]
    for (let i = 1; i < path.length; i++) {
      if (!candidates(ctx, ok[i - 1]).some((c) => c.step.key === path[i].key)) break
      ok.push(path[i])
    }
    if (ok.length !== path.length) setPath(ok)
  }, [graph, active])

  function open(id: string) {
    if (!ctx) return
    setEntryId(id)
    setPath([rootStep(ctx, id)])
    setPinned(null)
  }
  const go = (p: Step[]) => {
    setPath(p)
    setPinned(null)
    setHovered(null)
  }

  // Keyboard navigation (functional updates, so fast key presses never read a stale line).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ctx || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return
      const move: Record<string, (p: Step[]) => Step[]> = {
        ArrowLeft: (p) => (p.length > 1 ? p.slice(0, -1) : p),
        ArrowRight: (p) => {
          const c = p.length ? candidates(ctx, p[p.length - 1])[0] : undefined
          return c ? [...p, c.step] : p
        },
        Home: (p) => p.slice(0, 1),
        End: (p) => mainLineEnd(ctx, p),
      }
      const f = move[e.key]
      if (!f) return
      e.preventDefault()
      setPath((p) => (p.length ? f(p) : p))
      setPinned(null)
      setHovered(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error) return <div class="pane error-box">Could not load the databases: {error}</div>
  if (!ctx || !entryId || !path.length) return <div class="pane loading">Loading databases…</div>

  const step = path[path.length - 1]
  const board = displayBoard(ctx, step)
  const entry = graph!.entries.get(entryId)!
  const win: [number, number, number, number] = settings.view === 'full' ? [0, 18, 0, 18] : cornerWindow(settings.display.corner)

  // Move numbers and last move, in display coordinates.
  const numbers = new Map<string, number>()
  let last: Pt | null = null
  path.forEach((st, i) => {
    if (!st.edge) return
    const pt = st.edge.pt ? apply(frame(ctx, path[i - 1]), st.edge.pt) : null
    if (pt) numbers.set(`${pt[0]},${pt[1]}`, i)
    if (i === path.length - 1) last = pt
  })

  const cands = candidates(ctx, step).filter((c) => !c.cat || !settings.hiddenCategories.includes(c.cat))
  const tenuki = cands.find((c) => !c.pt)

  // Messages and their visual references.
  const messages = collectMessages(ctx, path, settings)
  const refMarks = new Map<string, Mark[]>()
  for (const m of messages) for (const s of m.segments) if ('ref' in s) refMarks.set(s.id, s.ref)
  // Summary and other entry text can also hold references.
  const ef = entryFields(ctx, entryId, path[0])
  for (const prop of ['XSUM', 'XRULE']) for (const t of ef.text(prop)) for (const s of t.segments) if ('ref' in s) refMarks.set(s.id, s.ref)
  const colors = settings.aids === 'always' ? new Map([...refMarks.keys()].map((id, i) => [id, REF_PALETTE[i % REF_PALETTE.length]])) : null
  const shownRefs = colors ? [...refMarks.keys()] : [hovered ?? pinned].filter((x): x is string => !!x)
  const marks: Mark[] = [
    ...(settings.overlays ? positionMarks(ctx, step) : []),
    ...shownRefs.flatMap((id) =>
      (refMarks.get(id) ?? []).map((m) => ({ ...m, color: colors ? colors.get(id) : undefined })).map((m) =>
        colors && (hovered ?? pinned) && (hovered ?? pinned) !== id ? { ...m, color: 'rgba(128,128,128,.45)' } : m,
      ),
    ),
  ]
  const refs: RefHandlers = {
    hovered,
    pinned,
    colors,
    onHover: setHovered,
    onPin: (id) => setPinned(pinned === id ? null : id),
  }

  const callout = messages.filter((m) => m.place === 'callout')
  const moveNo = path.length - 1
  const lastSign = step.edge ? applySign(frame(ctx, path[path.length - 2]), step.edge.sign) : 0
  const lastName = `${lastSign === 1 ? 'Black' : 'White'} ${last ? ptName(last) : 'tenuki'}`
  const toPlay = toMove(ctx, step)

  const setDisplay = (d: Partial<Settings['display']>) => setSettings({ ...settings, display: { ...settings.display, ...d } })
  const toggleDb = (id: string) => {
    const next = new Set(active)
    next.has(id) ? next.delete(id) : next.add(id)
    setSettings({ ...settings, activeDatabases: databases.map((d) => d.id).filter((d) => next.has(d)) })
  }

  const libEntries = entries
    .filter((e) => e.type === lib)
    .map((e) => ({ e, name: entryName(e.id), f: entryFields(ctx, e.id, rootStep(ctx, e.id)) }))
    .filter(({ name, f }) => !query || (name + ' ' + f.list('XTAG').join(' ')).toLowerCase().includes(query.toLowerCase()))
  const families = new Map<string, typeof libEntries>()
  for (const it of libEntries) {
    const fam = lib === 'joseki' ? (it.f.one('XFAM')?.value.split('/')[0] ?? 'Other') : (it.f.one('XLOC')?.value ?? 'Other')
    families.set(fam, [...(families.get(fam) ?? []), it])
  }

  return (
    <div class="layout">
      <header class="pane top">
        <h1>Baduk Notebook</h1>
        <div class="grp">
          <button class="on">Explore</button>
          <button disabled title="Coming in milestone M5">Find position</button>
          <button disabled title="Coming in milestone M7">Quiz</button>
        </div>
        <div class="grp">
          <span class="grp-label">Databases</span>
          {databases.map((d) => (
            <label key={d.id} class="layer" title={d.description}>
              <input type="checkbox" checked={active.has(d.id)} onChange={() => toggleDb(d.id)} />
              <span class="swatch" style={{ background: d.color }} />
              {d.name}
            </label>
          ))}
        </div>
        <span class="spacer" />
        <div class="grp">
          <button disabled title="Coming in milestone M4">Edit</button>
          <button onClick={() => setShowSettings(true)} aria-label="Settings"><SettingsIcon size={16} /> Settings</button>
        </div>
      </header>

      <aside class="pane left">
        <div class="tabs">
          <button class={lib === 'joseki' ? 'on' : ''} onClick={() => setLib('joseki')}>Joseki</button>
          <button class={lib === 'shape' ? 'on' : ''} onClick={() => setLib('shape')}>Shapes</button>
        </div>
        <input class="search" placeholder="Search by name or tag" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} aria-label="Search library" />
        {[...families].map(([fam, list]) => (
          <div key={fam}>
            <div class="fam">{fam}</div>
            {list.map(({ e, name, f }) => (
              <button key={e.id} class={`item ${e.id === entryId ? 'cur' : ''}`} onClick={() => open(e.id)}>
                <span>{name}</span>
                <span class="k">{f.one('XDIFF')?.value ?? ''}</span>
              </button>
            ))}
          </div>
        ))}
        {libEntries.length === 0 && <p class="hint">No entries in the active databases.</p>}
      </aside>

      <main class="pane center">
        <div class="status">
          {entryName(entryId)} · {moveNo ? `Move ${moveNo}: ${lastName}` : 'Start position'} · <b>{toPlay === 1 ? 'Black' : toPlay === -1 ? 'White' : 'Either side'} to play</b>
        </div>
        <div class="board-wrap">
          <Board
            window={win}
            board={board}
            last={last}
            numbers={settings.moveNumbers ? numbers : null}
            coordinates={settings.coordinates}
            marks={marks}
            markers={settings.showNext ? cands.filter((c) => c.pt).map((c) => ({
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
        <div class="nav">
          <button disabled={path.length < 2} onClick={() => go(path.slice(0, 1))} aria-label="Start (Home)"><SkipBack size={16} /></button>
          <button disabled={path.length < 2} onClick={() => go(path.slice(0, -1))} aria-label="Back (←)"><ChevronLeft size={16} /></button>
          <button disabled={!cands.length} onClick={() => go([...path, cands[0].step])} aria-label="Forward (→)"><ChevronRight size={16} /></button>
          <button disabled={!cands.length} onClick={() => go(mainLineEnd(ctx, path))} aria-label="End of main line (End)"><SkipForward size={16} /></button>
          <span class="sep" />
          <button class="tenuki" disabled={!tenuki} onClick={() => tenuki && go([...path, tenuki.step])}>
            {tenuki && <CategoryDot cat={tenuki.cat} />}
            Tenuki{tenuki?.cat ? ` · ${CATEGORIES[tenuki.cat].label}` : ''}
          </button>
        </div>
        <div class="nav">
          <span class="grp-label">Orientation</span>
          <span class="corner-pick" role="group" aria-label="Corner">
            {(['tl', 'tr', 'bl', 'br'] as Corner[]).map((c) => (
              <button key={c} class={settings.display.corner === c ? 'on' : ''} onClick={() => setDisplay({ corner: c })} title={`Show in the ${{ tl: 'top-left', tr: 'top-right', bl: 'bottom-left', br: 'bottom-right' }[c]} corner`}>
                {{ tl: '◰', tr: '◳', bl: '◱', br: '◲' }[c]}
              </button>
            ))}
          </span>
          <button class={settings.display.mirror ? 'on' : ''} onClick={() => setDisplay({ mirror: !settings.display.mirror })} title="Mirror the corner along its diagonal">
            <ArrowLeftRight size={15} /> Mirror
          </button>
          <button class={settings.display.swap ? 'on' : ''} onClick={() => setDisplay({ swap: !settings.display.swap })} title="Swap Black and White">
            <Contrast size={15} /> Swap colors
          </button>
          <button onClick={() => setDisplay({ corner: 'tr', mirror: false, swap: false })} title="Show as stored"><RotateCcw size={15} /></button>
          <span class="sep" />
          <button class={settings.view === 'full' ? 'on' : ''} onClick={() => setSettings({ ...settings, view: settings.view === 'full' ? 'corner' : 'full' })}>Full board</button>
          <button class={settings.moveNumbers ? 'on' : ''} onClick={() => setSettings({ ...settings, moveNumbers: !settings.moveNumbers })}>Move numbers</button>
          <button class={settings.showNext ? 'on' : ''} onClick={() => setSettings({ ...settings, showNext: !settings.showNext })}>Next moves</button>
        </div>
        {callout.map((m, i) => (
          <Message key={i} kind="move" title={m.title} db={m.db} dbColor={dbColor(m.db)} callout>
            <Rich segments={m.segments} h={refs} />
          </Message>
        ))}
      </main>

      <aside class="pane right">
        <InfoPanel
          ctx={ctx}
          entryId={entryId}
          path={path}
          settings={settings}
          messages={messages}
          refs={refs}
          dbColor={dbColor}
          highlighted={highlighted}
          onHighlight={setHighlighted}
          onGo={go}
        />
      </aside>

      <section class="pane tree">
        <h2>Variation tree</h2>
        <div class="tree-box">
          <Tree ctx={ctx} root={path[0]} path={path} defaultDb={databases[0]?.id ?? ''} onSelect={go} />
        </div>
        <div class="legend">
          {(entry.type === 'joseki' ? ['main', 'alt', 'situational', 'slack', 'mistake', 'overplay', 'trick', 'punish'] : ['correct', 'ko', 'wrong']).map((c) => (
            <span key={c}><CategoryDot cat={c as never} />{CATEGORIES[c as keyof typeof CATEGORIES].label}</span>
          ))}
          <span>T = tenuki</span>
          <span>⇄ = joins a position shown elsewhere</span>
          <span><span class="dot" style={{ background: 'var(--db-extra)' }} />only in another database</span>
        </div>
      </section>

      {showSettings && <SettingsDialog s={settings} set={setSettings} close={() => setShowSettings(false)} />}
    </div>
  )
}

/** Follows the best next move while it is a good one (main, alternative, punishment…), so End never walks into a mistake. */
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

function positionMarks(ctx: Ctx, step: Step): Mark[] {
  return positionFields(ctx, step).marks()
}
