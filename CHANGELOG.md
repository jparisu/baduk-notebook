# Changelog

## Unreleased

### Position first
- The board is the starting point: play or set up a position and the app tells you what it is, how to continue, and the usual mistakes. It reopens on your last position, with buttons for the empty corner and the start of the current joseki.
- Joseki and shapes are **labels on positions**: a name can be given to any move of a big tree, and the moves after it carry it until another label starts. Next moves show "→ name" when they enter another label.
- Every line you play outside the databases stays in the session (dashed in the tree). "Save lines…" stores the ones you choose; "Erase variation" removes one.
- New layout: start buttons, library, tree and position info on the left; last move and next moves on the right; phone tabs Next · Why · Info · Tree.
- Edit mode: category buttons for the last move (marking a free move saves its line), "why", result in points, "Name this position", other fields under "More fields". Draw tools show their meaning on hover.
- Shapes: Black and White moves are shown separately, with a switch above the board.
- Find: one result per label; an exact match hides the other positions of the same joseki.
- Removed hint lines that repeated the obvious.

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
