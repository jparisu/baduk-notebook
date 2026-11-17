# Data model

Baduk Notebook stores one kind of thing: a **graph of positions joined by moves**.
"Joseki", "shape" and "life & death" are not separate kinds of data. They are part of a
position's `id` or of its `tags`.

## 1. Position (node)

A position is the stones on a local area of the board plus **who plays next**.

| Field | Meaning |
|---|---|
| `id` | **Unique identifier** of the position, used by the moves to build the graph (§3). Example: `joseki/4-4 point/3-3 invasion` for the start of a sequence, `joseki/4-4 point/3-3 invasion:4` for a later position. |
| `stones` | Black and white stones, in the upper-right corner frame (`B:pd,qf W:qc`). |
| `toPlay` | `B` or `W`. The same stones with the other player to move is a **different** position. |
| `tags` | Free nested tags for searching: `3-3`, `life & death/corner`, `ko`, `beginner`… |
| `free` | Placement: `corner` (default), `horizontal`, `vertical` or `anywhere` (§4). |
| `name` | Optional display name. Defaults to the last part of the sequence ("3-3 invasion"). |
| `eval` | Optional: `balance` (points, from Black's view, local), `difficulty` (kyu/dan), `status` for life & death (`alive`, `dead`, `ko`, `seki`, `unsettled`). |
| `notes` | Free text, with board marks (triangles, arrows, influence…). |
| `extra` | Other details, with their SGF-style names: summary (`XSUM`), aliases, sources, evaluation symbol (`XEV`), status (`XST`), life & death results (`XSB`, `XSW`…), board marks (`TR`, `SQ`, `AR`…). |
| `moves` | The moves from this position (§2). |

**Inherited fields:** a position without its own value shows the value of the closest earlier position of
the line you played, until it sets its own. This holds for points, points source, evaluation, sente,
explanation, outcome, tenuki, aji, note, tags, difficulty and the life & death results. Names, the
joseki-end status, board marks and every move field are not inherited. Inheritance stops at the start
of a sequence (a named variation does not inherit the notes of the joseki it leaves). Nothing is
copied: clearing your own value brings the inherited one back.

**Same position:** two positions are the same when one is a rotation or reflection of the other
(8 symmetries), with the same colors and the same player to move. Colors are **not** swapped.
Black to play and White to play, with the same stones, are different positions. A tenuki move
joins them.

**Player words in texts:** `{{Player}}` is the player who made the move (in a move's `why`/`notes`) or who plays
next (in a position's text), `{{Opponent}}` the other one. `{{Black}}` and `{{White}}` follow the board's
*Swap colors* option. Lowercase tokens (`{{player}}`) give lowercase words. Rotating or mirroring the board never
changes colors.

## 2. Move (edge)

Moves are stored inside the position they start from and point to the **id** of the position they
lead to. The app checks that playing the move really gives that position.

| Field | Meaning |
|---|---|
| `move` | A point (`qc`) or `tenuki` (play elsewhere: same stones, the other player to move). |
| `to` | Id of the position it leads to. |
| `status` | One set for every position: `main`, `alt`, `situational`, `slack`, `mistake`, `overplay`, `trick`, `punish`. |
| `why` | Why the move is good or bad. |
| `notes` | Free text with board marks. |
| `extra` | Other details: style (`XSTY`), purpose (`XPUR`), conditions, board marks. |

Rules:
- A move always adds exactly one move to the line: a stone (possibly capturing) or a tenuki.
- No two tenukis in a row. No move may return to a position already on the line (no loops).

## 3. Ids, sequences and tags

### `id`
Every position is stored with a unique id. The id has two parts: `<sequence>:<N>`.

- **Sequence:** nested with `/`. Joseki use `joseki` as the root: `joseki`,
  `joseki/4-4 point`, `joseki/4-4 point/3-3 invasion`.
  - A sequence includes every shorter one: `joseki/4-4 point/3-3 invasion` is inside
    `joseki/4-4 point`, which is inside `joseki`.
- **N:** the move number where the position is, counted from the starting position of the graph
  (the empty corner is N = 0). Tenuki counts as a move. It is not a stone count, because captures
  remove stones.
- **The start of a sequence has no `:N`.** Its id is just the sequence name, e.g.
  `joseki/4-4 point/3-3 invasion`.
  - The empty corner is `joseki`.
  - The 4-4 stone is `joseki/4-4 point`.
  - The 2-2 invasion of the 3-3 point starts `joseki/3-3 point/2-2 invasion`; the move into it has status `mistake`.
- **Branches at the same N** get a letter: `…/3-3 invasion:4`, `…/3-3 invasion:4b`, `…/3-3 invasion:4c`.
- **New positions** take the sequence of the position they come from, with the next N; the app
  writes the id for you. When a line becomes its own variation, you name it: it gets a new
  sequence such as `…/3-3 invasion/aggressive`, and the moves after it take that sequence.
- **Ids are identifiers, not live data.** If a shorter line to a position is added later, its id
  keeps the old N. Renaming a sequence rewrites the ids and every move pointing to them.
- **Transpositions:** a position reached from two sequences is stored once, with the id it got
  first. Moves from both sequences point to it.

### Order inside a sequence
- **Start:** the position whose id has no `:N`.
- **Order:** by N, then by letter.
- **Ends:** positions of the sequence with no move to another position of the same sequence.
- **Main path:** from the start, follow the `main` moves while the sequence stays the same.
- The loader also computes the real shortest distance from the start, to warn when an id's N is
  out of date. It never changes ids on its own.

### Tags
- Free and nested, all in one list (`life & death/corner`, `3-3`, `ko`).
- Used only for searching; they do not affect the tree.
- **Favourites:**
  - each database lists its common tags in `index.json` (`"commonTags": [...]`);
  - you can star any tag, and stars are kept in the browser;
  - the picker shows starred and common tags first, then the whole tag tree.

## 4. Placement (`free`)

The board shows every position in the **upper-right corner** by default.

| `free` | The stones may be found… | Example |
|---|---|---|
| `corner` | only at that distance from both edges | joseki, corner life & death |
| `horizontal` | anywhere along the top edge, same distance from it | a 2nd-line side shape (2nd and 3rd line differ) |
| `vertical` | anywhere along the right edge, same distance from it | the same, along the other side |
| `anywhere` | anywhere | a centre shape (tiger's mouth, ponnuki) |

Find matches a position by sliding its stones along the free directions, for all 8 symmetries.

## 5. Finding positions

- **By stones:** place stones (Find) and the app lists the matching positions with their ids and tags.
- **By id and tags:** pick an id branch (`joseki` › `4-4 point` › `3-3 invasion`) and/or tags,
  and optionally type part of a name.
- Results are **sequences, not single positions**. Each row is one id and opens at its start.
- The list is a tree that follows the ids.

## 6. Tree

The tree draws the graph around the line you are on.

### Layout
- The tree is always laid out like the complete tree, in a fixed order (database moves best first,
  then your own moves). Moving through it never moves it: selecting the third child moves the
  selection to the third row. The modes only hide parts of it; hidden rows keep their place.
- The tree has a fixed size and scrolls only when the current move would leave it.

### Your trail
- The app remembers the lines you visit in this session (the **trail**).
- **Ahead** of the current move the tree shows, in this order: the moves you stepped back over; the
  last line you saw through this position (from the trail); the main line. → and End follow it.
- A move that is not in any database (free play) opens a new branch at that point.
- The trail is kept in the browser with the session.

### Modes
| Mode | Shows |
|---|---|
| **Linear** | Only this line: the moves before the current one and the line ahead. |
| **Proximity** | Only this line, plus the other moves from the current position. |
| **Complete** | Every move in the active databases and your own moves, except hidden branches. |

- Placing stones moves the tree to that line. If the line leaves the databases, it branches there.
- **Right-click a move:**
  - **Hide this branch:** a view-only setting, kept in the browser. A "+n" badge shows what is hidden.
  - **Forget this branch:** removes it from your trail (database moves stay in the database).
  - **Remove this move** (only for moves that are not in a database): deletes it and what follows.
- The current line is never hidden: hiding the branch you are on steps back to where it starts.
- **Ahead** (all / next 3 / 6 / 10) and zoom work in every mode.

### Design
- Design shows the same tree with the same right-click options, plus editing (status, why, id, name…).
- **Only new:** hides everything that is already in the target database except the position you
  started from.

  Example: on the 3-3 point you start `joseki/3-3 point/2-2 invasion`. The tree shows the 3-3 stone,
  then only the moves you add, each with the status you give it (2-2 as `mistake`, the punishment…).

  "New" means added in this Design session, so moves stay visible after you save them to the database.

## 7. Storage

Each database is a folder under `db/` with JSON files; any file may hold any positions.

```json
{
  "positions": [
    { "id": "joseki", "stones": "", "toPlay": "B", "name": "Empty corner",
      "moves": [{ "move": "pd", "to": "joseki/4-4 point", "status": "main" }] },
    { "id": "joseki/4-4 point", "stones": "B:pd", "toPlay": "W",
      "moves": [{ "move": "qc", "to": "joseki/4-4 point/3-3 invasion", "status": "main", "why": "Takes the corner." }] },
    { "id": "joseki/4-4 point/3-3 invasion", "stones": "B:pd W:qc", "toPlay": "B",
      "eval": { "balance": 0, "difficulty": "20k" },
      "moves": [{ "move": "pc", "to": "joseki/4-4 point/3-3 invasion:3", "status": "main" }] },
    { "id": "joseki/4-4 point/3-3 invasion:3", "stones": "B:pd,pc W:qc", "toPlay": "W", "moves": [] }
  ]
}
```

- Inside a database, moves link positions by id; ids are unique per database.
- Across databases, positions are matched by their stones (8 symmetries). When two databases
  describe the same position with different ids, the app merges them. The first active database's
  id is shown, and moves pointing to either id lead to the merged position.
- When databases disagree on a field, the database listed **last** wins, so a personal database
  (listed after `general`) can override it. Text fields (notes, why) show every database's text.
- **SGF:**
  - loading an SGF makes each node a position and each move a move;
  - comments become notes;
  - you can download any position with what follows it as SGF.
- A script converts the current SGF database once. The `X*` properties map as follows:

  | SGF property | New field |
  |---|---|
  | XFAM | the sequence part of `id`, under `joseki/` |
  | XNAME | `name` |
  | XTAG | `tags` |
  | category | `status` |
  | XPB | `balance` |
  | XDIFF | `difficulty` |
