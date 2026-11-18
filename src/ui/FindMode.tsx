/** Find position (SPEC §7): set up stones or load an SGF, then see matching joseki and shapes. */
import { useMemo, useState } from 'preact/hooks'
import GoBoard from '@sabaki/go-board'
import * as sgf from '@sabaki/sgf'
import { Workbench } from './Workbench'
import { Board } from './Board'
import { search, userViewFor, type Match } from '../core/search'
import { parseSgfPt, parseSgfPtList, ptName, type DisplayOptions, type Pt, type Sign, type SignMap } from '../core/geometry'
import { candidates, rootStep, type Ctx, type Step } from '../view'
import type { Settings } from '../settings'
import { CATEGORIES } from '../core/fields'
import { IDENTITY } from '../core/geometry'

type Tool = 'B' | 'W' | 'alt' | 'erase'
const empty = (): SignMap => Array.from({ length: 19 }, () => Array<Sign>(19).fill(0))

interface Game {
  setup: { B: Pt[]; W: Pt[] }
  moves: { sign: Sign; pt: Pt | null }[]
}

function boardAt(game: Game, n: number): SignMap {
  let b = GoBoard.fromDimensions(19)
  for (const p of game.setup.B) b = b.set(p, 1)
  for (const p of game.setup.W) b = b.set(p, -1)
  for (const m of game.moves.slice(0, n)) if (m.pt) {
    try {
      b = b.makeMove(m.sign, m.pt)
    } catch {
      /* skip illegal moves in imported games */
    }
  }
  return b.signMap as SignMap
}

function parseGame(text: string): Game {
  const root = sgf.parse(text)[0]
  if (!root) throw new Error('No game found in this SGF.')
  const game: Game = { setup: { B: [], W: [] }, moves: [] }
  for (let n: sgf.SgfNode | undefined = root; n; n = n.children[0]) {
    for (const v of n.data.AB ?? []) game.setup.B.push(...parseSgfPtList(v))
    for (const v of n.data.AW ?? []) game.setup.W.push(...parseSgfPtList(v))
    for (const [k, s] of [['B', 1], ['W', -1]] as const) if (n.data[k]) game.moves.push({ sign: s, pt: parseSgfPt(n.data[k][0] ?? '') })
  }
  return game
}

function lineSteps(ctx: Ctx, entryId: string, keys: string[]): Step[] {
  const out = [rootStep(ctx, entryId)]
  for (const k of keys.slice(1)) {
    const c = candidates(ctx, out[out.length - 1]).find((c) => c.step.key === k)
    if (!c) break
    out.push(c.step)
  }
  return out
}

export function FindMode(props: { ctx: Ctx; phone: boolean; settings: Settings; entryName: (id: string) => string; onOpen: (id: string, keys: string[], display: DisplayOptions) => void }) {
  const { ctx } = props
  const [board, setBoard] = useState<SignMap>(empty)
  const [tool, setTool] = useState<Tool>('alt')
  const [nextAlt, setNextAlt] = useState<Sign>(1)
  const [game, setGame] = useState<Game | null>(null)
  const [moveNo, setMoveNo] = useState(0)
  const [paste, setPaste] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const results = useMemo(() => search(ctx.graph, ctx.active, board), [board, ctx.graph, ctx.active])
  const base: Ctx = { ...ctx, U: IDENTITY }

  const onPoint = ([x, y]: Pt) => {
    const next = board.map((r) => [...r]) as SignMap
    if (tool === 'erase') next[y][x] = 0
    else if (tool === 'alt') {
      next[y][x] = next[y][x] ? 0 : nextAlt
      if (!board[y][x]) setNextAlt((-nextAlt) as Sign)
    } else {
      const s: Sign = tool === 'B' ? 1 : -1
      next[y][x] = next[y][x] === s ? 0 : s
    }
    setGame(null)
    setBoard(next)
  }

  const loadGame = (text: string) => {
    try {
      const g = parseGame(text)
      setGame(g)
      setMoveNo(g.moves.length)
      setBoard(boardAt(g, g.moves.length))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const openMatch = (m: Match) => {
    const steps = lineSteps(base, m.entryId, m.keys)
    props.onOpen(m.entryId, m.keys, userViewFor(m.toCanon, steps[steps.length - 1].D))
  }

  const tools = (
    <div class="find-tools">
      <h2>Set up a position</h2>
      <div class="tool-grid">
        {(['alt', 'B', 'W', 'erase'] as Tool[]).map((t) => (
          <button key={t} class={tool === t ? 'on' : ''} onClick={() => setTool(t)}>{{ alt: 'Alternate', B: '● Black', W: '○ White', erase: 'Erase' }[t]}</button>
        ))}
      </div>
      <div class="grp">
        <button onClick={() => { setBoard(empty()); setGame(null); setNextAlt(1) }}>Clear board</button>
        <label class="file-btn">
          Load SGF file…
          <input type="file" accept=".sgf,application/x-go-sgf,text/plain" onChange={async (e) => {
            const f = (e.target as HTMLInputElement).files?.[0]
            if (f) loadGame(await f.text())
          }} />
        </label>
        <button onClick={() => setPaste('')}>Paste SGF</button>
      </div>
      {paste !== null && (
        <div class="paste">
          <textarea id="paste-sgf" placeholder="(;GM[1]SZ[19];B[pd];W[dp]…)" value={paste} onInput={(e) => setPaste((e.target as HTMLTextAreaElement).value)} />
          <div class="grp"><button onClick={() => setPaste(null)}>Cancel</button><button class="on" onClick={() => { loadGame(paste); setPaste(null) }}>Load</button></div>
        </div>
      )}
      {error && <p class="error">{error}</p>}
      {game && (
        <div class="game-nav">
          <label for="move-slider">Move {moveNo} of {game.moves.length}</label>
          <input id="move-slider" type="range" min={0} max={game.moves.length} value={moveNo} onInput={(e) => {
            const n = Number((e.target as HTMLInputElement).value)
            setMoveNo(n)
            setBoard(boardAt(game, n))
          }} />
        </div>
      )}
      <h2>How it searches</h2>
      <p class="hint">Each 10×10 corner is compared with every position fixed in the corner, in all 8 orientations (colors are never swapped). Positions that may slide, such as side and centre shapes, are also found where you placed them. Exact matches come first, then positions contained in yours, then positions that differ by up to 2 stones.</p>
    </div>
  )

  const list = (
    <div class="results">
      <h2>Matches ({results.length})</h2>
      {!board.some((r) => r.some(Boolean)) && <p class="hint">Place stones on the board, or load a game, to search.</p>}
      {board.some((r) => r.some(Boolean)) && results.length === 0 && <p class="hint">No joseki or shape matches these stones.</p>}
      {results.map((m, i) => {
        const steps = lineSteps(base, m.entryId, m.keys)
        const next = candidates(base, steps[steps.length - 1]).slice(0, 3)
        const view = userViewFor(m.toCanon, steps[steps.length - 1].D)
        return (
          <button key={i} class="result" onClick={() => openMatch(m)}>
            <span class="r-head">
              <span class={`pill pill-${m.kind}`}>{{ exact: 'Exact', contained: 'Contained', near: 'Near' }[m.kind]}</span>
              <b>{m.labels.map(props.entryName).join(' · ')}</b>
            </span>
            <span class="r-meta">
              {m.keys.length > 1 ? `Move ${m.keys.length - 1}` : 'Start position'} · {m.where}
              {view.swap ? ' · colors swapped' : ''}{view.mirror ? ' · mirrored' : ''}
              {m.kind === 'contained' ? ` · ${m.extra} extra stone${m.extra === 1 ? '' : 's'}` : ''}
              {m.kind === 'near' ? ` · differs by ${m.missing + m.extra}` : ''}
            </span>
            {next.length > 0 && (
              <span class="r-next">Next: {next.map((c) => `${c.pt ? ptName(c.pt) : 'tenuki'} (${c.cat ? CATEGORIES[c.cat].label.toLowerCase() : '?'})`).join(', ')}</span>
            )}
          </button>
        )
      })}
    </div>
  )

  const center = (
    <main class="pane center">
      <div class="status"><b>Find position</b> · click to place stones</div>
      <div class="board-wrap">
        <Board window={[0, 18, 0, 18]} board={board} last={null} numbers={null} markers={[]} marks={[]} coordinates={props.settings.coordinates} onPoint={onPoint} />
      </div>
      {props.phone && tools}
    </main>
  )
  if (props.phone) return <>{center}<aside class="pane right">{list}</aside></>
  return (
    <Workbench
      id="find"
      cols={[
        { id: 'left', name: 'left', label: 'Tools', width: 280, min: 220, max: 480, node: <aside class="pane left">{tools}</aside> },
        { id: 'center', node: center },
        { id: 'right', name: 'right', label: 'Matches', width: 380, min: 260, max: 640, node: <aside class="pane right">{list}</aside> },
      ]}
    />
  )
}
