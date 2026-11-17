# Data model (draft for review)

Baduk Notebook stores one kind of thing: a **graph of positions joined by moves**.
"Joseki", "shape", "life & death" are not separate kinds of data; they are tags.

## 1. Position (node)

A position is the stones on a local area of the board plus **who plays next**.

| Field | Meaning |
|---|---|
| `id` | Short stable id, unique in its database (e.g. `p-3f9a`). |
| `stones` | Black and white stones, in the upper-right corner frame (`B:pd,qf W:qc`). |
| `toPlay` | `B` or `W`. Same stones with the other player to move is a **different** position. |
| `free` | Placement: `corner` (default), `horizontal`, `vertical` or `anywhere` (see §4). |
| `name` | Optional. |
| `tags` | Nested tags, all in one list (see §3). |
| `eval` | Optional: `balance` (points, from Black's view, local), `difficulty` (kyu/dan), `status` for life & death (`alive`, `dead`, `ko`, `seki`, `unsettled`). |
| `notes` | Free text, with board marks (triangles, arrows, influence…). |

**Same position:** two positions are the same when one is a rotation or reflection of the other
(8 symmetries), with the same colors and the same player to move. Colors are **not** swapped:
a shape with Black to play and the same shape with White to play are different positions,
joined by a tenuki edge when that is what happened.

## 2. Edge (move)

An edge goes from one position to the next.

| Field | Meaning |
|---|---|
| `from`, `to` | Position ids. |
| `move` | A point (`qc`) or `tenuki` (play elsewhere: same stones, the other player to move). |
| `status` | `main`, `alternative`, `situational`, `slack`, `mistake`, `overplay`, `trick`, `punishment`. |
| `why` | Why the move is good or bad. |
| `notes` | Free text with board marks. |

Rules:
- An edge always adds exactly one move (a stone, possibly with captures, or a tenuki).
- No two tenukis in a row, and no edge that returns to a position already on the line (no loops).

## 3. Tags

- **All tags live in one list, and all are nested** with `/`: `joseki`, `life & death/corner`,
  `4-4 point`, `4-4 point/3-3 invasion`, `4-4 point/3-3 invasion/aggressive`.
- A position with a nested tag also has every shorter tag: `4-4 point/3-3 invasion` implies `4-4 point`.
- **Copied forward:** when you add a move, the new position gets the tags of the position it comes
  from. When a variation becomes its own line, you give it a deeper tag (add `/aggressive`) and the
  moves after it copy that one. Tags are stored on every position, never inherited at read time.
- A position reached by two different lines can have the tags of both.

### Sequence of a tag
The positions that have a tag `T` form a small tree of moves:
- **N** of a position: number of moves on the shortest path from a starting position (a position
  with no incoming edge, such as the empty corner or a life & death setup). Tenuki counts as a move.
  N is **computed on load, never stored**, so it stays right when lines are added.
- **Start of `T`:** the position with tag `T` and the lowest N.
- **Ends of `T`:** positions with tag `T` and no move to another position with tag `T`.
- **Main path of `T`:** from the start, follow the `main` edges while the tag stays `T`.

### The sequence you are in
On the line you played, the current sequence is the most specific tag of the current position
(deepest; on a tie, the tag with fewer positions). It follows where you came from: a position
with two tags uses the one shared with the previous position on your line. The tree toolbar lets
you switch to another tag of the position.

### Favourite tags
- Each database lists its **common tags** in `index.json` (`"commonTags": ["joseki", "4-4 point", "life & death"]`).
- You can **star** any tag; stars are kept in the browser.
- The tag picker shows starred and common tags first as chips, then the whole tag tree.

## 4. Placement (`free`)

The board shows every position in the **upper-right corner** by default.

| `free` | The stones may be found… | Example |
|---|---|---|
| `corner` | only at that distance from both edges | joseki, corner life & death |
| `horizontal` | anywhere along the top edge, same distance from it | a side shape on the 2nd line (2nd and 3rd line differ) |
| `vertical` | anywhere along the right edge, same distance from it | the same, along the other side |
| `anywhere` | anywhere | a centre shape (tiger's mouth, ponnuki) |

Find matches a position by sliding the stones along the free directions, for all 8 symmetries.

## 5. Finding positions

- **By stones:** place stones (Find) and the app lists the positions that match, with their tags.
- **By tags:** pick one or more tags (all must match) and optionally type part of a name.
  Example: `joseki` + `4-4 point/3-3 invasion` lists the 3-3 invasion sequences.
- Results are **sequences, not single positions:** one row per most specific tag under the query,
  opening at the start of that sequence. Positions further down are reached by playing the moves.
- The list is a tree following the nested tags (`4-4 point` › `3-3 invasion` › `aggressive`).

## 6. Tree view

The tree shows the **sequence you are in**, from its start, with every move after it:
- Moving back and forth along it never changes the tree.
- An edge that leads to a deeper tag is drawn as one node, "→ aggressive". Click it to step in.
- Moves to positions without the tag (other joseki, tenuki to another area) are drawn as
  "→ name/tag" stubs and are not expanded.
- **Ahead:** all moves, or only the next 3 / 6 / 10. **Start here** sets your own start.

## 7. Storage

Each database is a folder under `db/` with JSON files; any file may hold any positions and edges.

```json
{
  "positions": [
    { "id": "p-44", "stones": "B:pd", "toPlay": "W", "tags": ["joseki", "4-4 point"], "name": "4-4 point" },
    { "id": "p-44-33", "stones": "B:pd W:qc", "toPlay": "B",
      "tags": ["joseki", "4-4 point/3-3 invasion"], "name": "3-3 invasion", "eval": { "balance": 0, "difficulty": "20k" } }
  ],
  "edges": [
    { "from": "p-44", "to": "p-44-33", "move": "qc", "status": "main", "why": "Takes the corner." }
  ]
}
```

- Positions are matched across files and databases by their stones (with symmetries), not by id,
  so two databases describing the same position merge. Ids only link edges inside a database.
- When databases disagree on a field, the first active database in the list wins.
- **SGF:** load an SGF file (each node becomes a position, each move an edge, comments become notes)
  and download any position with what follows it as SGF.
- The current SGF database is converted once by a script; `X*` properties map to the fields above
  (XNAME → name, XFAM → tag, XTAG → tags, category → edge status, XPB → balance, XDIFF → difficulty).

## Open points
1. The tie rule for "the sequence you are in" (§3).
2. Whether the empty corner is a position (start of every joseki) or each joseki starts at its first stone.
