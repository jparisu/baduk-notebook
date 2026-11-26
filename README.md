# Baduk Notebook

A personal web app to study, store and annotate Go joseki and shapes (eye shapes, life and death).

- Live site: https://jparisu.github.io/baduk-notebook/
- Specification: [SPEC.md](SPEC.md)
- Original layout mock-up: [docs/mockup.html](docs/mockup.html)

## What it does

- **Explore** joseki and shapes on a board with a variation tree. Next moves are colored by category (main, alternative, situational, slack, mistake, overplay, trick, punishment), tenuki included.
- **Comments with visual aids**: comments on moves ("why") and positions. Words in a comment can point at stones: hover or click them to see the marks on the board.
- **Databases** you can switch on and off (`general`, `jparisu`, …). Positions are recognized in any corner, orientation, color or move order, so notes from one database land on the right moves of another.
- **Orientation**: show any line in another corner, mirrored, or with colors swapped.
- **Edit**: add moves, mistakes and punishments, write comments, add any tag you like (known tags such as kind, intention, evaluation or status have their own controls; new keys can be created on the spot), draw marks and walls, create entries and databases. Changes are kept in your browser until you export them as a patch for a pull request.
- **Tags**: choose which tags Explore shows, and make or change tags: what they apply to (positions, moves or both) and their type (text, number with a range and step, options with icons and colors, a player, a board point, a rank, a balance…). Each database keeps its own tags and can add options to the ones of `general`.
- **Find position**: place stones or load an SGF game; the app finds matching positions (exact, contained, or up to 2 stones different), sliding side and centre shapes along the directions they allow.
- **Quiz** with spaced repetition: find the right move (or the punishment) in a random orientation.
- Works on phones (drawer, bottom navigation bar, swipe on the board). Three themes: Modern, Simple, Minimalist, each light or dark.

## How to use it

**During or after a game**: play the corner's moves on the board (or set them up in Find). The app recognizes the position whatever the order, corner or colors, and shows its name, the good continuations, the common mistakes and why.

**Recording what you learn**:
1. Play the line. Moves that are not in your databases are kept in the session (dashed in the tree), even when you go back and try another variation.
2. Press **Edit** and choose the database ("into …").
3. On any move, tap a category: **Mistake**, **Punishment**, **Main joseki**… This saves the line up to that move. Add a "why" and the result in points (`+3` = Black ahead by 3).
4. To start a new joseki or variation, use **Name this position**. The following moves carry that name.
5. Or save several lines at once with **Save lines…**, and remove the ones you don't want with **Erase**.
6. **Export** → **Download .patch** → `git apply` in your clone → pull request.

Fast keys in Edit mode (when the board has focus):

| Key | Action |
|---|---|
| `1`–`8` | Category: main, alt, situational, slack, mistake, overplay, trick, punish (shapes: correct, ko, wrong) |
| `A` / `B` / `S` | Style: aggressive / balanced / solid |
| `P` | Tenuki (pass) |
| `Enter` | Write the "why" of the move |
| `Esc` | Back to the board |
| `←` `→` `Home` `End` | Navigate (also outside Edit mode) |
| `↓` | One move forward along the next variation instead of the line → follows |

**Designing a tree** (for example every way the 2-2 invasion under the 3-3 point fails): open the **Design** tab, play the lines, switch the tree to **Only new** to see just what you add, right-click moves to classify them (Mistake, Punishment…), set their status and results in the editor, name the position where the variation starts (it becomes `joseki/3-3 point/2-2 invasion`), then **Save to database** and **Export / pull request → Propose on GitHub**. **Load SGF** adds every line of an SGF file; **SGF** downloads the position and what follows.

**Sharing**: the address bar always links to what is on the board, and the 🔗 buttons copy it. For example `https://jparisu.github.io/baduk-notebook/?open=joseki/3-4+point/Low+approach` opens that sequence at its first position; `&line=…` adds moves and `&view=br` the orientation (SPEC.md §8.9).

**By hand**: the databases are JSON files in `db/<database>/` with a list of positions and a list of moves (the data model is in [docs/MODEL.md](docs/MODEL.md)). Each position has an id such as `joseki/4-4 point/3-3 invasion:5`; each move goes `from` one id `to` another. Both have `comments` and free `tags`; each database's `tags.json` describes the tags the interface knows (made in the **Tags** tab). New databases also need a line in `db/index.json`, which can list `commonTags` for the library.

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

### Previews of pull requests

Every pull request (app changes and database updates) gets its own copy of the site at `https://jparisu.github.io/baduk-notebook/pr-preview/pr-<number>/`. The link is posted as a comment in the pull request and refreshed on every push, so you can check the result before merging. Previews keep their own settings, drafts and quiz progress, separate from the main site.

GitHub Actions runs type checks, unit tests, database validation and browser tests on every pull request, and deploys `main` to GitHub Pages.

### Layout

| Path | Contents |
|---|---|
| `db/` | Databases (JSON positions, docs/MODEL.md) and `index.json` |
| `src/core/` | Geometry and symmetries, hashing, position graph, search, validation |
| `src/edit/` | Editing workspace, SGF load and download, patch export |
| `src/quiz/` | Quiz cards and spaced repetition |
| `src/ui/` | Screens and components |
| `e2e/` | Browser tests |
