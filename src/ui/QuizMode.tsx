/** Quiz (SPEC §9): find the right move in a random orientation; spaced repetition decides what comes back. */
import { useMemo, useState } from 'preact/hooks'
import { Board } from './Board'
import { Message } from './Message'
import { Rich, type RefHandlers } from './Rich'
import { CATEGORIES } from '../core/fields'
import { SYMMETRIES, apply, applySign, cornerWindow, ptName, userTransform, withSwap, type Pt, type Transform } from '../core/geometry'
import { candidates, displayBoard, entryFields, frame, moveFields, rootStep, type Ctx, type Step } from '../view'
import { buildCards, loadProgress, queue, review, saveProgress, streak, type Card, type Progress, type Rating } from '../quiz/srs'
import { download } from '../edit/workspace'
import type { Settings } from '../settings'

const RANK = (r: string) => {
  const m = r.match(/^(\d+)([kd])$/)
  return m ? (m[2] === 'k' ? -Number(m[1]) : Number(m[1]) - 1) : 0
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

/** A random orientation, stable for one card. */
function randomView(seed: string): Transform {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  const s = SYMMETRIES[Math.abs(h) % 8]
  return withSwap(s, Math.abs(h >> 3) % 2 === 1)
}

export function QuizMode(props: { ctx: Ctx; phone: boolean; settings: Settings; entryName: (id: string) => string }) {
  const { ctx, settings } = props
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [type, setType] = useState<'joseki' | 'shape' | 'both'>('both')
  const [maxRank, setMaxRank] = useState('any')
  const [kind, setKind] = useState<'all' | 'main' | 'punish'>('all')
  const [answer, setAnswer] = useState<{ pt: Pt | null; ok: boolean; cat: string | null } | null>(null)
  const [reveal, setReveal] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [round, setRound] = useState(0)

  const cards = useMemo(() => {
    return buildCards(ctx.graph, ctx.active, ctx.order).filter((c) => {
      const e = ctx.graph.entries.get(c.entryId)!
      if (type !== 'both' && e.type !== type) return false
      if (kind === 'main' && c.kind !== 'main') return false
      if (kind === 'punish' && c.kind === 'main') return false
      if (maxRank !== 'any') {
        const d = entryFields(ctx, c.entryId, rootStep(ctx, c.entryId)).one('XDIFF')?.value
        if (d && RANK(d) > RANK(maxRank)) return false
      }
      return true
    })
  }, [ctx.graph, ctx.active, type, maxRank, kind])

  const now = Date.now()
  const q = queue(cards, progress, now, settings.quizNewPerDay)
  const card: Card | undefined = q.due[0] ?? q.fresh[0]
  const today = new Date().toISOString().slice(0, 10)
  const reviewedToday = Object.values(progress.cards).filter((s) => new Date(s.due - s.interval * 86_400_000).toISOString().slice(0, 10) === today).length
  const weakest = Object.entries(
    Object.entries(progress.cards).reduce<Record<string, { seen: number; correct: number }>>((acc, [id, s]) => {
      const e = id.split('|')[0]
      acc[e] = { seen: (acc[e]?.seen ?? 0) + s.seen, correct: (acc[e]?.correct ?? 0) + s.correct }
      return acc
    }, {}),
  )
    .filter(([, v]) => v.seen >= 2)
    .sort((a, b) => a[1].correct / a[1].seen - b[1].correct / b[1].seen)
    .slice(0, 3)

  const rate = (r: Rating) => {
    if (!card) return
    const next: Progress = {
      cards: { ...progress.cards, [card.id]: review(progress.cards[card.id], r) },
      days: progress.days.includes(today) ? progress.days : [...progress.days, today],
    }
    setProgress(next)
    saveProgress(next)
    setAnswer(null)
    setReveal(false)
    setRound(round + 1)
  }

  const deck = (
    <div class="quiz-deck">
      <h2>Quiz deck</h2>
      <div class="seg">
        {(['both', 'joseki', 'shape'] as const).map((t) => <button key={t} class={type === t ? 'on' : ''} onClick={() => setType(t)}>{{ both: 'All', joseki: 'Joseki', shape: 'Life & death' }[t]}</button>)}
      </div>
      <select value={maxRank} onChange={(e) => setMaxRank((e.target as HTMLSelectElement).value)} aria-label="Difficulty">
        <option value="any">Any difficulty</option>
        <option value="20k">Up to 20k</option>
        <option value="15k">Up to 15k</option>
        <option value="10k">Up to 10k</option>
        <option value="5k">Up to 5k</option>
      </select>
      <select value={kind} onChange={(e) => setKind((e.target as HTMLSelectElement).value as never)} aria-label="Lines">
        <option value="all">Main lines and mistakes</option>
        <option value="main">Main lines only</option>
        <option value="punish">Punishing mistakes only</option>
      </select>
      <div class="stats">
        <div><b>{q.due.length}</b><span>due</span></div>
        <div><b>{q.fresh.length}</b><span>new</span></div>
        <div><b>{streak(progress.days)}</b><span>day streak</span></div>
        <div><b>{cards.length}</b><span>cards</span></div>
      </div>
      {weakest.length > 0 && (
        <>
          <h2>Weakest</h2>
          {weakest.map(([e, v]) => <div key={e} class="weak">{props.entryName(e)} <span class="k">{Math.round((v.correct / v.seen) * 100)}%</span></div>)}
        </>
      )}
      <div class="grp">
        <button onClick={() => download('baduk-notebook-quiz-progress.json', JSON.stringify(progress, null, 2), 'application/json')}>Export progress</button>
        <label class="file-btn">
          Import…
          <input type="file" accept=".json,application/json" onChange={async (e) => {
            const f = (e.target as HTMLInputElement).files?.[0]
            if (!f) return
            try {
              const p = JSON.parse(await f.text()) as Progress
              if (p && p.cards) {
                setProgress(p)
                saveProgress(p)
              }
            } catch {
              /* not a progress file */
            }
          }} />
        </label>
      </div>
      <p class="hint">{reviewedToday ? `${reviewedToday} reviewed today. ` : ''}Cards you miss come back in 10 minutes; cards you know come back after longer and longer gaps.</p>
    </div>
  )

  if (!card) {
    return (
      <>
        {!props.phone && <aside class="pane left">{deck}</aside>}
        <main class="pane center quiz-done">
          <h2>All done for now</h2>
          <p>No cards are due. Come back later, add more entries, or widen the deck.</p>
          {props.phone && deck}
        </main>
      </>
    )
  }

  const U = settings.quizRandom ? randomView(card.id + round) : userTransform({ corner: 'tr', mirror: false, swap: false })
  const qctx: Ctx = { ...ctx, U }
  const path = lineSteps(qctx, card.entryId, card.keys)
  const step = path[path.length - 1]
  const F = frame(qctx, step)
  const sign = applySign(F, card.sign)
  const cands = candidates(qctx, step).filter((c) => c.sign === sign)
  const good = cands.filter((c) => c.cat && CATEGORIES[c.cat].good)
  const best = good[0]
  const corner = (() => {
    // Show the corner where the stones are.
    const anyStone = displayBoard(qctx, step).flatMap((r, y) => r.map((s, x) => (s ? [x, y] : null))).find(Boolean) as Pt | undefined
    const [x, y] = anyStone ?? [15, 3]
    return (y < 9 ? 't' : 'b') + (x < 9 ? 'l' : 'r')
  })() as 'tl' | 'tr' | 'bl' | 'br'

  const check = (pt: Pt | null) => {
    if (answer) return
    const hit = cands.find((c) => (pt ? c.pt && c.pt[0] === pt[0] && c.pt[1] === pt[1] : !c.pt))
    setAnswer({ pt, ok: !!(hit?.cat && CATEGORIES[hit.cat].good), cat: hit?.cat ?? null })
  }

  const shown = answer || reveal ? (reveal ? cands : good) : []
  const refs: RefHandlers = { hovered, pinned: null, colors: null, onHover: setHovered, onPin: () => {} }
  const why = best ? moveFields(qctx, step, best.edge).text('XMW') : []
  const marks = hovered ? why.flatMap((t) => t.segments.flatMap((s) => ('ref' in s && s.id === hovered ? s.ref : []))) : []
  const answerName = (pt: Pt | null) => (pt ? ptName(pt) : 'tenuki')
  const entryName = props.entryName(card.entryId)
  const from = props.settings.quizRandom ? ' (random orientation)' : ''

  const panel = (
    <div class="quiz-panel">
      <h2>{q.due.length ? `${q.due.length} due` : 'New card'} · {card.kind === 'punish' ? 'Punish the mistake' : card.kind === 'mistake' ? 'After a mistake' : 'Joseki move'}</h2>
      <p class="quiz-q"><b>{sign === 1 ? 'Black' : 'White'} to play.</b> {card.kind === 'punish' ? 'How do you punish the last move?' : 'Find the right move. Tenuki counts as a move.'}</p>
      <p class="hint">From: {entryName}{from}</p>
      {!answer && !reveal && (
        <div class="grp">
          <button onClick={() => check(null)}>Tenuki</button>
          <button onClick={() => setReveal(true)}>Show the answer</button>
        </div>
      )}
      {(answer || reveal) && (
        <>
          {answer && (
            <div class={`feedback ${answer.ok ? 'ok' : 'bad'}`} role="status">
              <b>{answer.ok ? 'Correct' : 'Not this one'}</b> — you played {answerName(answer.pt)}
              {answer.cat ? ` (${CATEGORIES[answer.cat as keyof typeof CATEGORIES].label.toLowerCase()})` : answer.ok ? '' : ' (not in the database)'}.
              {!answer.ok && best && <> The answer is <b>{answerName(best.pt)}</b>.</>}
            </div>
          )}
          {why.map((t, i) => (
            <Message key={i} kind="move" title={`${best ? answerName(best.pt) : ''} · why`} db={t.db} dbColor="var(--muted)">
              <Rich segments={t.segments} h={refs} />
            </Message>
          ))}
          <div class="rate">
            <span class="grp-label">How well did you know it?</span>
            <div class="grp">
              <button onClick={() => rate('again')}>Again</button>
              <button onClick={() => rate('hard')} disabled={answer ? !answer.ok : true}>Hard</button>
              <button class="on" onClick={() => rate(answer?.ok ? 'good' : 'again')}>{answer?.ok ? 'Good' : 'Next'}</button>
              <button onClick={() => rate('easy')} disabled={answer ? !answer.ok : true}>Easy</button>
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <>
      {!props.phone && <aside class="pane left">{deck}</aside>}
      <main class="pane center">
        <div class="status"><b>Quiz</b> · {sign === 1 ? 'Black' : 'White'} to play</div>
        <div class="board-wrap">
          <Board
            window={props.settings.view === 'full' ? [0, 18, 0, 18] : cornerWindow(corner)}
            board={displayBoard(qctx, step)}
            last={step.edge?.pt ? apply(frame(qctx, path[path.length - 2]), step.edge.pt) : null}
            numbers={null}
            coordinates={props.settings.coordinates}
            marks={marks}
            onPoint={answer || reveal ? undefined : check}
            pending={answer?.pt ? [answer.pt] : []}
            markers={shown.filter((c) => c.pt).map((c) => ({ pt: c.pt!, sign: c.sign, showColor: false, cat: c.cat, title: c.cat ? CATEGORIES[c.cat].label : '', highlight: false, onClick: () => {} }))}
          />
        </div>
        {props.phone && panel}
      </main>
      {!props.phone && <aside class="pane right">{panel}</aside>}
      {props.phone && <aside class="pane right">{deck}</aside>}
    </>
  )
}
