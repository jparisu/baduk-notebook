# Changelog

## v0.2.0

### Positions, moves, comments and tags (docs/MODEL.md)
- **Two kinds of record**: positions (nodes) and moves (edges). A file holds `positions` and `moves`; a move is just `from` and `to`, and the point played is worked out from the two positions. When only the player changes, the move is a tenuki.
- **Comments and tags** on both: a list of comments (the texts shown, with board references you can hover or click), and a free dictionary of tags. Any key can be used on any position or move without declaring it, with a text, number, yes/no or list value. A new position or move starts with no tags.
- **Known tags** (`db/tags.json`, replaces `db/schema.json`): only describes the keys the interface shows its own way (`kind` with its colors, `intention`, `evaluation` bar, `sente` stone, `status`, life & death results, `difficulty` rank…). Other keys are shown as key: value. Descriptions say where a key is offered (`for`), whether it is always offered (`suggest`), and whether it belongs to **This joseki** (`panel: "sequence"`).
- **Editor**: each record shows only the tags it has (plus suggested ones, values other databases set there, and inherited ones), each with a × to remove it. **+ Add a tag** picks a known key, a key used elsewhere, or creates a new one with its type; **Rename a key…** renames one.
- **Settings › Tags shown** lists every key, described or used in the databases, to hide any of them.
- Renamed keys: `category` → `kind`, `style` → `intention` (now several options), `tags` → `topics`. The name and other names are one `name` list; a sequence's summary became the first comment of its start position; notes became comments.
- **Board shapes** are the `board` tag, in the same `TYPE:points` syntax as references in comments (`TR:Q16`, `AR:Q16-R14`, `EYE:S18`).
- **Two tenukis are like none**: a tenuki back to the position a tenuki came from is refused, so the tree cannot loop.
- **SGF**: downloads carry tags in an `XT` property and comments as SGF comments, and load back with them.
- `scripts/migrate-0.2.mjs` converted the databases (same 165 positions and 161 moves); the old one-off SGF conversion scripts were removed.
- Drafts saved in the browser by an earlier version are not restored (new storage key).

### Position-first interface
- **One Position panel** replaces "This joseki" and "Position evaluation": the sequence the position belongs to (name, other names, topics, difficulty, sources), its main move, its tags and its comments.
- **One editor** in Explore (Edit) and Design: the position (comments, tags, main move), its name, then the move into it from the previous position of your line. The Move / Position / Name tabs of Design are gone. The move part only appears once the previous position is in a database, since the same position can be reached by several moves.
- **Main move** of each position: the `main` tag, chosen in the editor or with **Make this the main move** in the tree; by default the first stored move. The tree and → follow it, unless you have walked another line through the position; → now works the line ahead out again at each step, so a new main move counts at once. Next moves marks it.
- **Board size** is set in text units (40em) and never grows when the window gets smaller: side columns shrink to their minimum first, and below 1100px the panels stack under the board.
- The Sensei's Library page names that were written into four joseki descriptions ("Sources: 33PointInvasion, …") are now links in their `sources` tag.

### Explore
- **Lines start at the root.** A position opened from a link, the library or Find gets the moves that lead to it (back to the empty corner, by main moves), so the tree, move numbers and the names along the line all start there. Move numbers now match the ids (the 3-3 invasion's first move is move 3).
- **Names along the line** drop the part they share with the name before: "Empty corner › 4-4 point › 3-3 invasion › extend". Each opens its sequence at its first move, the current one too once you are past it (it replaces "Go to its first move"); the copy-link button sits next to the position's name.
- **Comments of a position** are each their own block, edged with their database's color, and fold from their header. Comment text is a little smaller in Last move and the same size for positions.
- The Position panel no longer shows the main move (it is in the editor and marked in Next moves).
- **Tree:** Linear and Proximity pack their rows (no empty rows for hidden moves; the other moves from here sit next to the current one), and the line ahead always goes on to the end along the main moves. Dashed outlines of moves that are not stored are thinner.
- **↓** plays the next variation, where → follows the line.
- A comment's `{{R16}}` (a point without a shape) showed as raw text; it is now a reference, and the validator reports any `{{…}}` that is not one.

### Find
- **Colors swapped:** stones placed with Black and White the other way round are found too. Such results say "colors swapped", come after a match with the colors as stored, and open with Swap colors on.
- **Every position can be found.** Positions after a named variation that kept the id of the sequence before it (such as the life & death positions after White plays first) were never indexed, so Find missed them in any orientation. Side shapes already slid along their edge; a test now checks every life & death position on every edge, slid, and with colors swapped.

- **Next to play** (Black, White or either): only positions with that player to move are listed, so when the same stones exist for both players you get the one you mean. Placing stones alternately sets it; loading a game sets it from the last move. The "Next: …" line under each result is gone.
- **Side shapes slide along any edge.** The placements "slides along the top edge" and "slides along the right edge" became one, `side`: the shape slides along whichever edge it sits on. Every side life & death shape was stored against the right edge but marked as sliding along the top one, so Find only moved it away from the edge, never along it; a bent four on the side is now found anywhere on any edge.

### Editor (Explore and Design)
- **Two tabs again:** Position, and Move into it. Every part is a box (Comments, Tags, Next moves, Name; Kind, Comments, Tags for the move), and each tag is a row of its own with a line between them.
- **Adding a tag is one click:** every known key, and every key used elsewhere, is a chip under the tags; clicking adds it with its control ready (a yes/no tag is set at once). "+ New key…" creates one.
- **Values from other databases** are shown with "from general" (or the earlier move they are inherited from) instead of an empty field. Setting one stores your own value; **Edit in general** switches the edits to the database that has it, where it can be changed or removed. Other databases' comments are shown too, read only.
- **Descriptions:** hovering a tag's name or an option shows what it means ("Alternative: an unusual but valid play", "Reduce: to reduce the opponent's territory…"). Every known tag and option has one, editable in Known tags.
- **Main move = the first move.** The `main` tag is gone. The editor lists the next moves in order with ↑ ↓; the first is the main move. A personal database decides the order only when it stores every move from the position (reordering from it copies them in). The moves in the data were put in the order they were shown before (good moves first), so nothing changes until you reorder.
- A tag can be removed right after it is added, before it has a value (it had no ×).
- The move tab works like the position tab: Comments, then Tags with the same Add chips; the kind is one of its tags.
- **Naming a position:** its parents are chips (the current ones by default; remove any, add any) and its name is the position's move number by default. Stored joined as the id; renaming a sequence works the same way.
- **Evaluation meter:** the bar has level marks and says the level in words: Even, Slightly better / Better / Much better / Winning for Black or White.
- Each tag is a raised card of its own, in the editor and in the Explore panels, clear on light and dark themes.
- × removes any tag shown, also one another database stores (it is removed from that database). Clicking a database's badge switches the edits to it.
- Naming a position offers the name of the sequence it comes from and a number ("3-3 invasion 1"), with no explanation around it.
- Explanations moved out of the way: ⓘ icons (Comments, Next moves, Find's search and "next to play") and tooltips replace the help sentences.

### Find results
- Each match says who plays next (in the colors of your board) instead of the corner you placed it in.

### Fixes
- Right after a deploy, the site could fail with "Could not load the databases: JSON.parse…" because the browser reused the previous version's file list. Database files are now always revalidated, and only `.json` files are loaded.

### Data model, first JSON version (superseded above where they differ)
- **Values and keys**: a position or move is its notes plus a dictionary of values. The keys live in `db/schema.json` and are edited in the app (**Keys…**): label, icon, type (choice, several choices, slider, flag, color, text, list), options with icons and colors, what Swap colors does, and inheritance. "This move is", Evaluation, Status, Black/White plays first, Sente, Ko, Tags, Difficulty… are all keys.
- Points are gone. Evaluation is a slider between White and Black, shown as a bar without numbers.
- Tags are a key; the shape descriptors became keys of their own (eye space, surrounded, outside liberties, inside stones, arrangement, ko type).
- Settings choose which keys the panels show.
- **Notes**: positions and moves have one list of notes (add as many as you like). Explanation, Outcome, Tenuki here, Watch out, Note, Eyes, Liberties and the rules note became notes with their lead word; a move's Why and note became its notes. Notes from a personal database show as cards in its color.
- Life & death results name the color: "Black plays first: Black lives / Black dies / White lives / White dies / Ko / Seki / Unsettled"; Swap colors flips them.
- One set of move categories for everything: Main move, Alternative, Situational, Slack, Mistake, Overplay, Trick play, Punishment (shape moves: correct → main, wrong → mistake, ko → situational). The editor shows the same fields for every position.
- Each shape is one family, and its variations are named sequences inside it: `life & death/Bent four/Corner`, `…/Corner/Black vital point`, `…/Corner/White first`, `…/Corner/White first/White vital point`.
- No shape-only fields remain: "Black first / White first" are the general *If Black / White plays next* results, the vital point is the named main move, and size, surroundings, liberties, inside stones, arrangement and ko type became nested tags (`eye space/4 points`, `ko/direct`…). Joseki and life & death differ only by the first part of their id.
- Position fields (points, evaluation, explanation, notes, tags, difficulty…) are inherited from the earlier positions of the line until a position sets its own; the editor shows where they come from. Move fields are never inherited.
- Texts can say `{{Player}}`, `{{Opponent}}`, `{{Black}}`, `{{White}}`; they follow who moved and the Swap colors option. Every stored text now uses `{{Black}}` / `{{White}}` (scripts/player-words.ts).
- The databases are JSON files of **positions** with a unique **id** (`joseki/4-4 point/3-3 invasion:5`); each move points to the id it leads to. A script converted the SGF files.
- "Joseki" and "shape" are no longer separate kinds: the id (`joseki/…`, `life & death/…`) and nested **tags** organise everything.
- Colors are never swapped when matching positions; Black to play and White to play are different positions, joined by a tenuki (shapes now start with Black to play, and a tenuki leads to White playing first).
- Positions have a **placement**: fixed in the corner, sliding along one edge, or anywhere. Find slides them accordingly.
- Naming a position starts a new sequence; the following positions move into it.
- Library: one tree of ids, tags matched with their deeper tags, **favourite tags** (common tags from `index.json` and your own stars).
- **SGF**: load an SGF file into a database, download any position with what follows.

### Layout
- **This joseki** keeps its sub-panels (Description, Details) in view; each scrolls inside its share.
- Databases are shown by color: titles are underlined in their database's color, and tree nodes from a database other than the first have a line in its color under them. Colors can be changed in Settings (only in this browser; several databases may share one).
- Fixed-size panels in every tab, like an editor's side bars: sizes depend only on the window, the zoom and what you set, never on the content, which scrolls inside each panel.
- Columns are separated by vertical bars: drag a bar to resize, use its button to collapse or reopen the column (remembered). The empty row with the hide button is gone.
- The side panels are a stack: each panel keeps its share of the height, its header collapses it, and the thin bar between two panels resizes them.

### Find
- One result per set of stones: the same stones after a tenuki (other player to move) are no longer listed again.
- The board is kept when you open a match and come back (and after a reload). **Undo**, **Redo** (Ctrl+Z / Ctrl+Y) and **Clear board** under the board.

### Board marks
- New **Eye** mark (◉ Eye in the Draw tools, `{{EYE:S19|the eye}}` in texts), stored as `XEYEM` on the position.

### Library
- Tags sit in one row of chips (selected ones and favourites): click to select or deselect; *All tags…* opens the full list. The results scroll in their own box, so the tags never disappear.

### Tree
- The tree never moves when you move through it: it is always laid out like the complete tree, in a fixed order, and Linear / Proximity only hide parts of it. It sits at the top of the right panel with a fixed size.
- Dashed nodes mean only one thing: not stored in a database yet.
- **Trail**: the app remembers the lines you visit; going back to a move shows (and → / End follow) the last line you saw there.
- **Linear** shows only this line; **Proximity** this line plus the moves from the current position; **Complete** everything.
- A move played mirrored (e.g. R16 where the database has Q17) keeps its orientation when you move through the tree.
- In Explore and Design, with **Ahead** (all, next 3 / 6 / 10) and zoom.
- Right-click: **Hide this branch** (view only, with a "+n" badge and *Show hidden*), **Forget this branch**, remove moves that are not in a database.
- Design: **Only new** shows the position you started from and only the moves added since you opened Design.

### Design tab
- New **Design** mode with three panels: board, a large tree of moves, and the info of the selected move (Move / Position / Name tabs).
- Right-click a move in the tree: category, joseki end, result, why, name a joseki, make it the main line, copy link, hide, delete.
- Moves stay in the browser cache until **Save to database**; **Export / pull request** adds **Propose on GitHub**, which opens GitHub with the new files filled in.
- Library: **Good only / All / Mistakes**; joseki that start with a mistake show in red.


### Shareable links
- Links open a joseki, shape or exact position: `?open=<id>`, `&line=<moves>`, `&view=<corner>[-m][-s]`. The address bar follows the board; "Copy link" buttons next to the title and in This joseki.


### Layout and data fixes
- Tree of moves: three modes, Linear (only this line), Proximity (the line plus the other options after the current move) and Complete (the whole tree), and a zoom with − / +; both remembered. Own scroll, lines with more contrast, white stones white again.
- "Save lines (n)" moved to the top bar; "back to the database" and "erase" sit next to the "Free play" label. The session box is gone.
- Position evaluation moved to the left panel, under This joseki.
- Desktop fits on one screen (tested at 1366×768, 1440×900, 1920×1080): each column scrolls on its own and the board follows the window height.
- Library: families fold and unfold (4-4 point › 3-3 invasion › Hane…), search by name, and a list of tags to filter by.
- Data: joseki start from a single stone; the approach (or invasion) is a move that carries the joseki name. New connectors "4-4 point", "3-4 point" and "3-3 point" open every joseki that starts from that stone; the empty corner leads to them.


### Pull request previews
- Every pull request is published at its own address (`/pr-preview/pr-<number>/`) with the link posted in the pull request, so changes can be checked before merging. The main site is now published from the `gh-pages` branch.
- Previews use their own browser storage and show a "Preview · pr-N" label.


### Layout v3
- Left: foldable **Search** and **This joseki** cards (title, path of names, go to its first move, family, tags, foldable description and details).
- Center: title with move and side to play, board, navigation, view options.
- Right: foldable **Position evaluation**, **Last move**, **Tree of moves** and **Next moves** cards.
- Both side panels can be hidden; folded cards are remembered.
- New message shapes: a large "why" card in the move's category color, an amber "Watch out" card, yellow sticky notes.
- Good moves that start another named variation are drawn as a **dashed ring** on the board, in the tree and in the list; next moves are grouped as Joseki, Variations, and Mistakes and traps.
- Phone: the "why" card stays under the board; tabs Next · Position · Tree · About.


### Position first
- The board is the starting point: play or set up a position and the app tells you what it is, how to continue, and the usual mistakes. It reopens on your last position, with buttons for the empty corner and the start of the current joseki.
- Joseki and shapes are **labels on positions**: a name can be given to any move of a big tree, and the moves after it carry it until another label starts. Next moves show "→ name" when they enter another label.
- Every line you play outside the databases stays in the session (dashed in the tree). "Save lines…" stores the ones you choose; "Erase variation" removes one.
- New layout: start buttons, library, tree and position info on the left; last move and next moves on the right; phone tabs Next · Why · Info · Tree.
- Edit mode: category buttons for the last move (marking a free move saves its line), "why", result in points, "Name this position", other fields under "More fields". Draw tools show their meaning on hover.
- Shapes: Black and White moves are shown separately, with a switch above the board.
- Find: one result per label; an exact match hides the other positions of the same joseki.
- Removed hint lines that repeated the obvious.

### Joseki and shapes
- **New joseki** in `general`, checked against Sensei's Library: 4-4 low approach (small knight and one-space extensions with the slide, one-space low pincer with the 3-3 invasion, kick, attach-extend, attach-block, tenuki), 3-4 low approach (diagonal, small knight, kick, one-space low pincer), 3-4 high approach (attach-drawback with solid or hanging connection), 3-3 shoulder hit and 3-3 high approach. Named variations are labels on their first move (slide joseki, kick, attach-extend, attach-block, 3-3 invasion hane / double hane / extend / knight's move, 3-4 diagonal, attach-drawback…), so the status line and "→ name" follow them as you play.
- **3-3 invasion** rewritten from the example: the standard hane-extend line, the old continuation, the double hane, and the extension for sente. The earlier direct-hane line and its mistakes are kept as a side branch.
- **New shapes**: bent three, bent four (side), bent four in the corner, square four, pyramid four, bulky five, crossed five, rabbity six. Each result and vital point is checked with a small life-and-death search.

### Earlier in this release

- **Free play**: click any empty point to play outside the databases. Back and forward also step through your own moves. Messages come back when the line reaches a known position, also by transposition. "Save this line" stores the moves in a database.
- **Empty corner** entry: Black chooses the first move (4-4, 3-4, 3-3, 5-4, 5-3) and the line continues into the joseki that start there. The status line and info panel show the most specific entry.
- **Visual aids**: on touch screens a tap shows the marks and a second tap hides them; with a mouse, hover shows them and a click keeps them. New setting "Click or tap only".
- Punishment moves are now blue; ko moves (shapes) are cyan.

## v0.1.0

First version of Baduk Notebook.

- **Explore** joseki and shapes: board, variation tree, next moves colored by category (tenuki included), info panel with message blocks and icons, visual references from text to the board.
- **Databases** that can be switched on and off, merged by canonical position (any corner, orientation, color or move order).
- **Orientation**: corner, diagonal mirror and color swap at any time.
- **Editing**: legal moves, joining known positions, all fields, fast keys, marks and overlays, new entries and databases, drafts in the browser, export as a patch or zip after validation.
- **Find position**: stones or SGF input; exact, contained and near matches; shapes moved along a side.
- **Quiz** with spaced repetition, random orientation, streak and weakest entries.
- **Phone layout** and three themes (Modern, Simple, Minimalist) with light and dark modes.
- Example databases `general` and `jparisu` (example moves still to be verified).
- CI: type checks, unit tests, database validation, browser tests on desktop and phone; deployment to GitHub Pages.
