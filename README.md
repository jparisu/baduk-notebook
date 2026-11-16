# Baduk Notebook

A personal web app to study, store and annotate Go joseki and shapes (eye shapes, life and death).

- Live site: https://jparisu.github.io/baduk-notebook/
- Specification: [SPEC.md](SPEC.md)
- Original layout mock-up: [docs/mockup.html](docs/mockup.html)

## What it does

- **Explore** joseki and shapes on a board with a variation tree. Next moves are colored by category (main, alternative, situational, slack, mistake, overplay, trick, punishment), tenuki included.
- **Notes with visual aids**: "why" explanations, position notes and warnings. Words in a note can point at stones: hover them to see the marks on the board.
- **Databases** you can switch on and off (`general`, `jparisu`, …). Positions are recognized in any corner, orientation, color or move order, so notes from one database land on the right moves of another.
- **Orientation**: show any line in another corner, mirrored, or with colors swapped.
- **Edit**: add moves, mistakes and punishments, fill in every field, draw marks and walls, create entries and databases. Changes are kept in your browser until you export them as a patch for a pull request.
- **Find position**: place stones or load an SGF game; the app finds matching joseki (exact, contained, or up to 2 stones different) and shapes.
- **Quiz** with spaced repetition: find the right move (or the punishment) in a random orientation.
- Works on phones (drawer, bottom navigation bar, swipe on the board). Three themes: Modern, Simple, Minimalist, each light or dark.

## Adding joseki and shapes

### In the app (recommended)
1. Press **Edit**, and choose the database that receives the edits ("into …"). Use "+ New database…" to start a new one.
2. Open an entry, or create one with **+ New joseki / New shape** in the library.
3. Click empty points to add moves. If a position already exists, the new line joins it.
4. Fill in the fields on the right. Fast keys while the board has focus:

   | Key | Action |
   |---|---|
   | `1`–`8` | Category: main, alt, situational, slack, mistake, overplay, trick, punish (shapes: correct, ko, wrong) |
   | `A` / `B` / `S` | Style: aggressive / balanced / solid |
   | `P` | Add tenuki |
   | `Enter` | Write the "why" of the move |
   | `Esc` | Back to the board |
   | `←` `→` `Home` `End` | Navigate |

5. To link words to stones: put the cursor in a text box (select the words if you like), choose a type under **Link text**, click the points, then **Insert**. This writes `{{TR:Q17,Q16|the words}}`.
6. **Export** → check the list → **Download .patch** → in your clone run `git apply <file>.patch` → open a pull request.

### By hand
Write SGF files in `db/<database>/joseki/` or `db/<database>/shapes/`. New databases also need a line in `db/index.json`. The properties are listed in SPEC.md §4. The file list is generated automatically by the build.

## Development

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run test:e2e
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm test` | Unit tests, including validation of every file in `db/` |
| `npm run validate` | Only the database validation |
| `npm run test:e2e` | Browser tests (desktop and phone) with Playwright |
| `npm run build` | Production build into `dist/` |

GitHub Actions runs type checks, unit tests, database validation and browser tests on every pull request, and deploys `main` to GitHub Pages.

### Layout

| Path | Contents |
|---|---|
| `db/` | Databases (SGF) and `index.json` |
| `src/core/` | Geometry and symmetries, hashing, position graph, search, validation |
| `src/edit/` | Editing workspace, SGF writer, patch export |
| `src/quiz/` | Quiz cards and spaced repetition |
| `src/ui/` | Screens and components |
| `e2e/` | Browser tests |
