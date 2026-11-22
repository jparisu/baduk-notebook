# Data model

Baduk Notebook stores two kinds of record: **positions** (the nodes of a graph) and **moves** (its
edges). Both have the same two free parts: a list of **comments** and a dictionary of **tags**.
"Joseki", "shape" and "life & death" are not separate kinds of data: they are part of a position's
`id` or of its tags.

## 1. Position (node)

A position is the stones on a local area of the board plus **who plays next**.

| Field | Meaning |
|---|---|
| `id` | **Unique identifier** of the position, used by the moves (§4). Example: `joseki/4-4 point/3-3 invasion` for the start of a sequence, `joseki/4-4 point/3-3 invasion:4` for a later position. |
| `stones` | Black and white stones, in the upper-right corner frame (`B:pd,qf W:qc`). |
| `toPlay` | `B` or `W`. The same stones with the other player to move is a **different** position. |
| `free` | Placement, only when it is not `corner`: `horizontal`, `vertical` or `anywhere` (§5). |
| `comments` | Optional. The texts shown for the position, in order (with board references, §3.2). |
| `tags` | Optional. Any keys and values (§3). |

Nothing else is a fixed field: a position's name, evaluation, status, difficulty… are tags.

**Main move:** every position with moves has one main move, the line the tree and → follow by default.
The position's `main` tag names the id the main move leads to (it must be one of its moves); without
it, the main move is the first move stored from the position, unless that is a bad move. Once you
have walked another line through a position, the tree and → follow the last line you took instead (§7).

**Same position:** two positions are the same when one is a rotation or reflection of the other
(8 symmetries), with the same colors and the same player to move. Colors are **not** swapped.
Black to play and White to play, with the same stones, are different positions; a tenuki joins them.

## 2. Move (edge)

| Field | Meaning |
|---|---|
| `from` | Id of the position it starts from. |
| `to` | Id of the position it leads to. |
| `comments` | Optional. Why the move is good or bad, and anything else about it. The first one is the short reason shown in Next moves. |
| `tags` | Optional. Any keys and values (§3), such as `kind` (main move, mistake…) and `intention`. |

- **The point played is not stored.** The app works it out from the two positions: `to` must be
  `from` plus one stone of the player to move (and the stones it captures), in any of the 8
  orientations. When only the player changes, the move is a **tenuki**.
- A move is stored in the same file as its `from` position.
- **Two tenukis are like none.** A tenuki from a position that was itself reached by a tenuki from
  this one would lead back where it started; the validator refuses it, so the tree never loops.
  No move may return to a position already on the line either.

## 3. Tags

Tags are a dictionary `{ key: value }` on every position and move. **Any key can be used** without
declaring it first, on any position or move; a new record starts with no tags at all, and you add
only the ones you want. A value is plain JSON:

| Value | Example |
|---|---|
| text | `"status": "end"`, `"difficulty": "20k"`, `"kind": "main"` |
| number | `"evaluation": 0.5`, `"liberties": 3` |
| yes / no | `"ko": true` |
| list of texts | `"name": ["3-4 point", "Komoku"]`, `"intention": ["aggressive"]` |

### 3.1 Known tags (`db/tags.json`)

Some keys are **known** by the interface: `db/tags.json` describes how to show and edit them. A key
that is not described still works: it is shown as `key: value` and edited as text, a number, yes/no
or a list, from its value. The descriptions are data too: they can be changed in the app
(**Keys…**) and are exported like any other change.

| Property | Meaning |
|---|---|
| `key`, `label`, `icon`, `hint` | Its name in the files, how it is shown, a symbol or emoji, a help text. |
| `type` | `choice` (dropdown, or buttons with `control: "buttons"`), `multi` (several options), `slider` (a bar between two `ends`, from -1 to 1, shown without numbers), `number`, `flag` (yes/no), `color` (B / W / none), `rank` (15k, 2d, 1p), `text`, `list`, `board` (§3.2). |
| `options` | For choices: `value`, `label`, `icon`, `color`, and `swap`: the option it becomes with Swap colors ("B-alive" ⇄ "W-alive"). Move kinds also say `good` and `ring`. |
| `for` | `move` or `position`: where the editor offers it first. Optional; any key can go anywhere. |
| `suggest` | Always offered in the editor, even before it has a value (the move `kind` buttons). |
| `panel` | `sequence`: shown in **This joseki**, read from the start of the sequence (name, topics, difficulty, sources, shape descriptors…), instead of the position panel. |
| `inherit` | Later positions show its value until they set their own (§3.3). |
| `negate` | Slider: Swap colors turns it around. |
| `swapKey` | The key it trades places with under Swap colors ("black-first" ⇄ "white-first"). |

Keys the app itself relies on:

| Key | On | Used for |
|---|---|---|
| `kind` | moves | Main move, alternative, mistake… Its options give the colors and symbols of the board marks, the tree and the lists, and which moves count as right answers. Required in `db/tags.json`. |
| `name` | positions | A list: the first is the title of the sequence, the others are other names. Defaults to the last part of the id. |
| `topics` | positions | Free nested words (`life & death/corner`, `ko`) used by the library to find sequences (§4). |
| `difficulty` | positions | A rank; the library and the quiz filter by it. |
| `board` | both | Shapes drawn on the board (§3.2). |
| `main` | positions | The id the main move leads to (§1). Set with **Main move** in the editor or **Make this the main move** in the tree. |

### 3.2 The `board` tag and references in comments

Shapes on the board use one syntax, `TYPE:points`, with points in the record's stored frame:

| Type | Example | Draws |
|---|---|---|
| `TR`, `SQ`, `CR`, `MA` | `TR:Q16,R17` | triangle, square, circle, cross |
| `LB` | `LB:Q16=A` | a letter |
| `CUT`, `EYE` | `EYE:S18` | cutting point, eye |
| `AR`, `LN`, `WALL`, `INF` | `AR:Q16-R14` | arrow, line, wall, influence (from–to) |
| `TB`, `TW` | `TB:Q16:R17` | black / white territory (a point or a rectangle) |

- The `board` tag is a list of these: `"board": ["TR:Q16", "AR:Q16-R14"]`. It is always drawn.
  The Draw tools in Edit write it for you.
- A comment can point at the board with the same syntax in braces: `{{TR:R16|the 3-4 stone}}`.
  The words are shown as a link; **hovering or clicking it shows the shapes** on the board.

**Player words in texts:** `{{Player}}` is the player who made the move (in a move's comments) or
who plays next (in a position's), `{{Opponent}}` the other one. `{{Black}}` and `{{White}}` follow
the board's *Swap colors* option. Lowercase tokens (`{{player}}`) give lowercase words. Rotating or
mirroring the board never changes colors.

### 3.3 Inherited tags

A position without its own value for a key described with `inherit` (evaluation, sente, the life &
death results) shows the value of the closest earlier position of the line you played. Inheritance
stops at the start of a sequence. Names, comments, board shapes, keys that are not described and
every move tag are never inherited. Nothing is copied: removing your own value brings the inherited
one back.

### 3.4 Showing tags

- The panels show the tags a position or move has, in the order of `db/tags.json` and then the other
  keys alphabetically. Known keys have their own look (a balance bar, a stone for a color, option
  icons and colors); other keys are shown as `key: value`.
- **Settings › Tags shown** hides any key, described or not. Hidden keys stay in the editor.

## 4. Ids, sequences and topics

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
  - The 2-2 invasion of the 3-3 point starts `joseki/3-3 point/2-2 invasion`; the move into it has `kind: mistake`.
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

### Topics
- The `topics` tag: free and nested words, all in one list (`life & death/corner`, `3-3`, `ko`).
- Used only for searching; they do not affect the tree.
- **Favourites:** each database lists its common topics in `index.json` (`"commonTags": [...]`);
  you can star any topic (kept in the browser); the picker shows starred and common ones first.

## 5. Placement (`free`)

The board shows every position in the **upper-right corner** by default.

| `free` | The stones may be found… | Example |
|---|---|---|
| `corner` | only at that distance from both edges | joseki, corner life & death |
| `horizontal` | anywhere along the top edge, same distance from it | a 2nd-line side shape (2nd and 3rd line differ) |
| `vertical` | anywhere along the right edge, same distance from it | the same, along the other side |
| `anywhere` | anywhere | a centre shape (tiger's mouth, ponnuki) |

Find matches a position by sliding its stones along the free directions, for all 8 symmetries.

## 6. Finding positions

- **By stones:** place stones (Find) and the app lists the matching positions with their ids and topics.
  Every orientation is tried, and also the colors swapped: a match found with Black and White swapped
  says so, comes after the same match with the colors as stored, and opens with Swap colors on.
  Every position of the databases can be found, including ones after a named variation that kept the
  id of the sequence before it.
- **By id and topics:** pick an id branch (`joseki` › `4-4 point` › `3-3 invasion`) and/or topics,
  and optionally type part of a name.
- Results are **sequences, not single positions**. Each row is one id and opens at its start.
- The list is a tree that follows the ids.

## 7. Tree

The tree draws the graph around the line you are on.

### Where a line starts
- A line always starts at a root: a position no move leads to, such as the empty corner. When you
  play your way to a position, the line is the moves you played. When you open a position directly
  (a link, the library, Find), the moves before it are filled in back to the root: at each step the
  move into the position that is its parent's main move, else any move into it.
- So the tree, the move numbers and the names along the line ("Empty corner › 4-4 point ›
  3-3 invasion › extend") always go back to the root. Each name drops the part it shares with the
  name before it.
- A link still names the sequence and the moves after its first position; the moves before it are
  found again when it opens.

### Layout
- Moves are always in the same fixed order (database moves best first, then your own moves), each
  node one column right of its parent, the first child on its parent's row.
- Each mode packs its rows as tightly as that allows: Linear and Proximity lay out only the lines they
  draw, so no rows are left empty for hidden moves. The rows of the lines only depend on which lines
  are drawn (the current one and your trail), so moving along them never moves the tree. In
  Proximity, the other moves from the current position take the first free rows next to it.
- The tree has a fixed size and scrolls only when the current move would leave it.

### Your trail
- The app remembers the lines you visit in this session (the **trail**).
- **Ahead** of the current move the tree shows, in this order: the moves you stepped back over; the
  last line you saw through this position (from the trail); the main line (the main move of each
  position, §1). Whichever it is, it goes on to the end along the main moves. → and End follow it,
  and it is worked out again at each step. ↓ plays the next variation instead (the first other move).
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
- Design shows the same tree with the same right-click options, plus editing (kind, comments, id, name…).
- **Only new:** hides everything that is already in the target database except the position you
  started from.

  Example: on the 3-3 point you start `joseki/3-3 point/2-2 invasion`. The tree shows the 3-3 stone,
  then only the moves you add, each with the kind you give it (2-2 as `mistake`, the punishment…).

  "New" means added in this Design session, so moves stay visible after you save them to the database.

## 8. Editing

In **Edit** and in **Design**, one panel edits the current position, in the database that receives the
edits, from top to bottom:

1. **The position:** its comments, its tags and its **main move** (a list of its next moves).
2. **Its name:** at the start of a sequence, its names, id and placement; elsewhere, naming the
   position starts a new sequence there.
3. **The move into it:** the move from the previous position of your line. The same position can be
   reached by other moves, and each keeps its own comments and tags, so this part belongs to the
   move, not to the position. It can only be described once the previous position is in a database.

In each part:

- **Comments:** one box each; add as many as you like, empty one or press × to remove it.
- **Tags:** the record shows only the tags it has, plus the ones `db/tags.json` suggests (the `kind`
  buttons), the ones other databases set here (so you can override them) and inherited values.
  Each tag has the control its type asks for and a × to remove it.
- **+ Add a tag:** pick a known key or one used elsewhere in the databases, or type a new key and
  choose its type. A new plain key (text, list, number, yes/no) lives only in the data. A new key
  whose type cannot be told from its value (options, a color, a rank, a balance) is also described in
  `db/tags.json`. **Rename a key…** renames a key that is not described, keeping its value.

## 9. Storage, merging and validation

Each database is a folder under `db/` with JSON files; any file may hold any positions, and holds
the moves that start from them.

```json
{
  "positions": [
    { "id": "joseki/4-4 point", "stones": "B:pd", "toPlay": "W",
      "tags": { "name": ["4-4 point", "Hoshi"], "difficulty": "25k" } },
    { "id": "joseki/4-4 point/3-3 invasion", "stones": "B:pd W:qc", "toPlay": "B",
      "comments": ["{{White}} lives small; {{Black}} gets the wall."],
      "tags": { "evaluation": 0, "topics": ["invasion"] } },
    { "id": "joseki/4-4 point/3-3 invasion:3", "stones": "B:pd,pc W:qc", "toPlay": "W" }
  ],
  "moves": [
    { "from": "joseki/4-4 point", "to": "joseki/4-4 point/3-3 invasion",
      "comments": ["Takes the corner."], "tags": { "kind": "main", "intention": ["solid"] } },
    { "from": "joseki/4-4 point/3-3 invasion", "to": "joseki/4-4 point/3-3 invasion:3",
      "tags": { "kind": "main" } }
  ]
}
```

- Inside a database, moves link positions by id; ids are unique per database.
- Across databases, positions are matched by their stones (8 symmetries). When two databases
  describe the same position with different ids, the app merges them. The first active database's
  id is shown, and moves from either one lead to the merged position.
- When databases disagree on a tag, the database listed **last** wins, so a personal database
  (listed after `general`) can override it. Lists (names, topics…) join every database's values,
  and every database's comments are shown (your own as cards in your database's color).
- **Validation** (in the app before export, and in CI): ids, that every move goes from one position
  to the next by a single move, no two tenukis in a row, and each tag against its description in
  `db/tags.json` (an option that does not exist, a rank like `15k`, a board shape like `TR:Q16`…).
  Keys that are not described accept any plain value.

## 10. SGF

- Loading an SGF makes each node a position and each move a move; SGF comments become comments.
- You can download any position with what follows it as SGF. Comments are written as SGF comments,
  and tags in an `XT` property (`XT[kind="main"][intention=["solid"]]`), so the file loads back
  with its tags.

## History

- **0.2:** positions and moves as two lists, each with `comments` and free `tags`; the point of a
  move is worked out from its two positions; `db/schema.json` became `db/tags.json`, describing
  only the keys the interface knows. `scripts/migrate-0.2.mjs` converted the 0.1 files.
