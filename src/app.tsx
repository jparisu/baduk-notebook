import { useEffect, useState } from 'preact/hooks'
import { Goban } from '@sabaki/shudan'
import type { SgfNode } from '@sabaki/sgf'
import { loadDatabases, type DatabaseInfo, type LoadedEntry } from './data/load'
import { boardAt, coordName, moveOf, pathTo } from './data/position'

const prop = (n: SgfNode, k: string) => n.data[k]?.[0] ?? ''

export function App() {
  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [entries, setEntries] = useState<LoadedEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [entry, setEntry] = useState<LoadedEntry | null>(null)
  const [node, setNode] = useState<SgfNode | null>(null)

  useEffect(() => {
    loadDatabases()
      .then(({ databases, entries }) => {
        setDatabases(databases)
        setEntries(entries)
        if (entries[0]) {
          setEntry(entries[0])
          setNode(entries[0].root)
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const path = entry && node ? pathTo(entry.root, node) ?? [entry.root] : []
  const board = boardAt(path)
  const last = node ? moveOf(node) : null
  const parent = path.length > 1 ? path[path.length - 2] : null

  const markerMap = board.signMap.map((row) => row.map(() => null as null | { type: string }))
  if (last?.vertex) markerMap[last.vertex[1]][last.vertex[0]] = { type: 'point' }
  const ghostStoneMap = board.signMap.map((row) => row.map(() => null as null | { sign: number; type: string }))
  for (const child of node?.children ?? []) {
    const m = moveOf(child)
    if (m?.vertex) ghostStoneMap[m.vertex[1]][m.vertex[0]] = { sign: m.color === 'B' ? 1 : -1, type: prop(child, 'XCAT') === 'main' ? 'good' : 'interesting' }
  }

  return (
    <div class="layout">
      <header class="pane top">
        <h1>Baduk Notebook</h1>
        <span class="hint">Early build (M0): loads the databases and shows one entry. See SPEC.md for the plan.</span>
        <span class="spacer" />
        {databases.map((d) => (
          <span class="badge" key={d.id} style={{ borderColor: d.color }}>{d.name}</span>
        ))}
      </header>

      <aside class="pane left">
        <h2>Library</h2>
        {error && <p class="error">{error}</p>}
        {entries.map((e) => (
          <button
            key={e.path + prop(e.root, 'XID')}
            class={`item ${e === entry ? 'on' : ''}`}
            onClick={() => { setEntry(e); setNode(e.root) }}
          >
            {prop(e.root, 'XNAME') || e.path}
            <span class="k">{prop(e.root, 'XDIFF')}</span>
          </button>
        ))}
      </aside>

      <main class="pane center">
        <Goban
          vertexSize={34}
          signMap={board.signMap}
          markerMap={markerMap}
          ghostStoneMap={ghostStoneMap}
          rangeX={[9, 18]}
          rangeY={[0, 9]}
          showCoordinates
          onVertexClick={(_e: Event, v: [number, number]) => {
            const child = node?.children.find((c) => {
              const m = moveOf(c)
              return m?.vertex && m.vertex[0] === v[0] && m.vertex[1] === v[1]
            })
            if (child) setNode(child)
          }}
        />
        <div class="nav">
          <button disabled={!parent} onClick={() => entry && setNode(entry.root)}>⏮</button>
          <button disabled={!parent} onClick={() => parent && setNode(parent)}>◀</button>
          <button disabled={!node?.children.length} onClick={() => node?.children[0] && setNode(node.children[0])}>▶</button>
        </div>
      </main>

      <aside class="pane right">
        <h2>Move</h2>
        <p>
          {last ? `${last.color === 'B' ? 'Black' : 'White'} ${last.vertex ? coordName(last.vertex) : 'tenuki'}` : 'Start position'}
          {node && prop(node, 'XCAT') && <span class="badge">{prop(node, 'XCAT')}</span>}
        </p>
        {node && prop(node, 'XMW') && <div class="msg">{prop(node, 'XMW')}</div>}
        {entry && <p class="hint">{prop(entry.root, 'XSUM')}</p>}
      </aside>
    </div>
  )
}
