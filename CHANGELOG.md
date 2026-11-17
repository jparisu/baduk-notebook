# Changelog

## Unreleased

### Data model (docs/MODEL.md)
- Texts can say `{{Player}}`, `{{Opponent}}`, `{{Black}}`, `{{White}}`; they follow who moved and the Swap colors option. Every stored text now uses `{{Black}}` / `{{White}}` (scripts/player-words.ts).
- The databases are JSON files of **positions** with a unique **id** (`joseki/4-4 point/3-3 invasion:5`); each move points to the id it leads to. A script converted the SGF files.
- "Joseki" and "shape" are no longer separate kinds: the id (`joseki/…`, `life & death/…`) and nested **tags** organise everything.
- Colors are never swapped when matching positions; Black to play and White to play are different positions, joined by a tenuki (shapes now start with Black to play, and a tenuki leads to White playing first).
- Positions have a **placement**: fixed in the corner, sliding along one edge, or anywhere. Find slides them accordingly.
- Naming a position starts a new sequence; the following positions move into it.
- Library: one tree of ids, tags matched with their deeper tags, **favourite tags** (common tags from `index.json` and your own stars).
- **SGF**: load an SGF file into a database, download any position with what follows.

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
