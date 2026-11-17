# Changelog

## Unreleased

- **Free play**: click any empty point to play outside the databases. Back and forward also step through your own moves. Messages come back when the line reaches a known position, also by transposition. "Save this line" stores the moves in a database.
- **Empty corner** entry: Black chooses the first move (4-4, 3-4, 3-3, 5-4, 5-3) and the line continues into the joseki that start there. The status line and info panel show the most specific entry.
- **Visual aids**: on touch screens a tap shows the marks and a second tap hides them; with a mouse, hover shows them and a click keeps them. New setting "Click or tap only".
- Punishment moves are now blue; ko moves (shapes) are cyan.
- **New joseki** in `general`, checked against Sensei's Library: 4-4 low approach (small knight and one-space extensions with the slide, one-space low pincer with the 3-3 invasion, kick, attach-extend, attach-block, tenuki), 3-4 low approach (diagonal, small knight, kick, one-space low pincer), 3-4 high approach (attach-drawback with solid or hanging connection), 3-3 shoulder hit and 3-3 high approach.
- **3-3 invasion** rewritten from the example: the standard hane-extend line, the old continuation, the double hane, and the extension for sente. The earlier direct-hane line and its mistakes are kept as a side branch.
- **New shapes**: bent three, bent four (side), bent four in the corner, square four, pyramid four, bulky five, crossed five, rabbity six. Each result and vital point is checked with a small life-and-death search.

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
