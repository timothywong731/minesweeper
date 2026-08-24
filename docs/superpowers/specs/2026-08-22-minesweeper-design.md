# Minesweeper (Online) — Design Spec

**Date:** 2026-08-22
**Status:** Approved — ready for implementation planning
**Stack:** Vanilla HTML/CSS/JS (ES modules), zero dependencies, zero build step
**Hosting:** GitHub Pages (fully static)

## 1. Goals

A faithful online Minesweeper with the classic Windows 95 feel: instantly playable in a
browser, fast, and feature-complete for solo play.

**In scope (v1):**
- Classic rules: three standard difficulties, safe first click, chording, question marks,
  LED counters, timer, smiley status button
- No-guess mode: boards provably solvable by local logic alone
- Daily challenge: one deterministic, no-guess board per calendar date, shared by all players
- Custom board sizes
- 3BV stat on best times
- Classic + Dark themes
- WebAudio sound effects (no audio files)
- Full mouse, touch, and keyboard play

**Out of scope (v1):** multiplayer, global leaderboards, accounts, ads, analytics, i18n,
PWA/installability, mid-game auto-save. See §10 for v2 candidates.

## 2. Market context

Researched 2026-08-22: Minesweeper.now, Minesweeper.org, MinesweeperHub, Minesweeper Pro,
ToolGenie, Minesweeper Blast, minesweeperplus.site, Google Minesweeper, Speed Sweeper (Steam).

Shared by the well-regarded ones: safe first click, chording, precise timer, **no-guess
(logically solvable) boards**, daily challenges, leaderboards, keyboard + touch support.
No-guess board generation is the most-cited differentiator in 2025 comparisons — the original
Windows game could force 50/50 guesses.

Constraint: GitHub Pages is static, so multiplayer and true global leaderboards are out
(they require a backend). Everything we differentiate on — no-guess generation, daily
challenge, 3BV — is 100% client-side.

## 3. Architecture

Single page, ES modules, no dependencies. One file per boundary; each file is understandable
and testable without the others:

```
minesweeper/
├── index.html              # markup, meta, favicon
├── style.css               # all styling; CSS custom properties per theme
├── js/
│   ├── logic.js            # pure functions, zero DOM — see §5
│   ├── game.js             # game state object, rule application, timer, persistence
│   ├── ui.js               # rendering, input (mouse/touch/keyboard), WebAudio sounds
│   └── main.js             # bootstrap: load settings → create game → wire UI
└── test/
    └── logic.test.mjs      # node --test; imports logic.js only
```

**Data flow:** input handler → `game.js` action (mutates the single `game` state object,
calls `logic.js` pure functions) → `ui.js render(game)` → DOM. `logic.js` never touches the
DOM or `game.js`; `game.js` never touches the DOM; `ui.js` never mutates game state directly —
it calls `game.js` actions.

**Rendering strategy:** one delegated click/context/pointer listener on the board container
(no per-cell listeners); a render pass per action that updates only the cells whose state
changed (class swaps, text nodes); full re-render only on reset or grid change. 480 cells is
trivial for the browser.

## 4. Core game rules

### Grids
| Difficulty | Rows × Cols | Mines |
|---|---|---|
| Beginner | 9 × 9 | 10 |
| Intermediate | 16 × 16 | 40 |
| Expert | 16 × 30 | 99 |
| Custom | 5–30 per side | 1 … (rows × cols) − 9 |

Custom input: rows, cols, mines as integers; validated client-side; mines clamped to
`[1, rows*cols − 9]` so the first-click safe zone always fits.

### Cell states
- **Revealed states:** hidden | revealed
- **Marker (independent of revealed):** none | flag | question mark

### Input semantics
- **Left click** on hidden cell → reveal (or chord if revealed, see below)
- **Left click** on a flagged cell → nothing
- **Left click** on a question-marked cell → reveal (classic behavior)
- **Right click** → cycle marker: none → flag → question → none
- **Chord:** double-click, *or* left+right simultaneously, on a revealed number cell where the
  count of **flags** (question marks do not count) in its neighbors equals the number → all
  remaining unmarked neighbors are revealed. If the flag count differs, nothing happens.
- **Touch:** tap = left click; **long-press (≥ 400 ms) = right click** (flag cycle), with the
  flag marker previewing the moment the long-press threshold is crossed so the gesture is
  learnable; double-tap = double-click chord
- **Keyboard:** arrow keys move a visible cursor cell; Space/Enter reveals; `F` flags; `Q`
  cycles question; `1`–`8` chords the cursor cell; `R` resets
- After win or loss, all board input is ignored until reset (smiley click or `R`)

### Safe first click
Mines are placed **after** the first click, excluding the clicked cell and its 8 neighbors
(3×3 zone, clipped to board). The first click always opens; on zero-count cells it cascade-fills.

### Reveal
Opening a zero cell cascade-reveals its connected zero region (flood fill) plus its numbered
border.

### Win / lose
- **Lose:** revealing a mine → show all mines, mark the clicked mine distinctly (exploded),
  show incorrect flags as crossed-out mines, stop the timer.
- **Win:** all non-mine cells revealed → auto-flag all remaining mines (including
  question-marked ones), stop the timer, record best time.

### Counters & timer
- Timer: 1-second ticks, starts on first click, clamped to 0–999 (LED style)
- Mine counter: mines − flags, range −99 … mines (negative allowed, classic behavior)
- 3BV: computed once per generated board, shown with best times and on the win screen

### 3BV definition
Number of clicks a perfect solver needs to reveal all safe cells: simulate opening — each
click opens a flood-fill region of connected zero cells (plus border numbers); every
distinct safe region not yet covered costs one click. Computed after final mine placement
(including no-guess boards).

## 5. Board generation (`logic.js`, pure)

### Seeded RNG
`mulberry32(seed) → () => float`. Deterministic; the entire board is a function of
`(rows, cols, mines, mode, seed)`.

### Classic (random) mode
Choose `mines` cells uniformly at random from all cells except the first click's 3×3 safe
zone, using the seeded RNG.

### No-guess mode
1. Generate a random board from seed `s`.
2. **Perfect-player validation:** simulate solving with only local logic —
   - flood-fill opens (zero regions)
   - a cell whose all mines are already flagged, revealed count = neighbors → flag all remaining unknown neighbors
   - a `1` with exactly one unknown neighbor → that cell is safe
   - repeat until solved or stuck
3. If the validator must guess, the board is **rejected**; retry with `s+1`.
4. Hard cap: 10,000 attempts (each ≈ 1–2 ms). Beginner/Intermediate typically solve within a
   handful of attempts. If the cap is ever hit, ship the best-effort random board and mark it
   `noGuess: false` in state — the game remains fully playable. (In practice: never.)

### Daily challenge
- Seed = local calendar date as integer (e.g. `20260822`); generated in no-guess mode
- All players, all difficulties, get the same board per difficulty on a given date
- Header button; daily best time stored per difficulty (see §6)

## 6. State & persistence

### `game` object (in memory)
```
{ settings,        // snapshot of the persisted settings — mode/difficulty live here
  rows, cols, mines, daily: bool, seed,
  status: 'waiting'|'playing'|'won'|'lost',
  grid: null | { rows, cols,
      cells: [ { mine, revealed, marker: 'none'|'flag'|'q', adjacent } ] },
  time: seconds, flags: count, threeBV: int, noGuessSolved: bool,
  explodedIndex: null | int,   // the mine that ended a lost game (rendered red)
  onTick: fn | null }          // assigned by main/ui to redraw the HUD each second
```

### `settings` (persisted)
`{ difficulty: 'beginner'|'intermediate'|'expert'|'custom',
    custom: { rows, cols, mines } | null,
    mode: 'classic'|'noguess',
    theme: 'classic'|'dark',
    sound: true }`

### `best` (persisted)
Keyed map: `{ 'beginner': { time, threeBV }, 'intermediate': {...}, 'expert': {...},
'custom-9x9x10': {...}, 'daily-20260822-beginner': {...} }`
Best = lowest time. If the same time is achieved again, the first record stands.

### Storage
Two `localStorage` keys: `minesweeper.settings`, `minesweeper.best`. Read on bootstrap with
safe defaults if absent/corrupt (try/catch JSON.parse). Mid-game auto-save is **not** in v1.

## 7. UI, aesthetics, input, sound

### Look — Windows 95, faithful
- Classic gray board in a sunken 3D well; beveled cells that flatten when revealed
- Red LED-style counters (pure CSS, no images) for mines and timer
- Smiley status button: neutral idle · surprised while a cell is hovered/pressed ·
  sunglasses on win · dead face on loss; clicking it resets
- Classic number colors: 1 blue, 2 green, 3 red, 4 navy, 5 maroon, 6 teal, 7 black, 8 gray
- Header row: difficulty select (with a `Custom…` option that opens the inline
  rows/cols/mines form) · mode select (Random / No-guess) · Daily button · sound toggle ·
  theme toggle

### Themes
- **Classic** (default): the 95 look above
- **Dark**: charcoal cells, amber LEDs, same bevel geometry
- Implemented via CSS custom properties; toggle persists in settings

### Responsive
Cell size = `min(28px, floor((viewportWidth − 32px) / cols))`, floor at 12px; below that the
board area scrolls horizontally (Expert at 30 cols on a phone). No page-level horizontal
scroll otherwise.

### Sound (WebAudio, synthesized — no files)
- Click reveal: short blip · flag: tick · question: soft tick · lose: low descending boom ·
  win: 3-note arpeggio
- Default on; AudioContext unlocked on first user gesture (browser requirement);
  toggle persists in settings; all sounds ≤ 300 ms

### Meta / favicon
`<title>Minesweeper</title>`, meta description, SVG mine favicon, `apple-touch-icon` (same
SVG). No external requests of any kind — all assets are local files.

## 8. Testing

`node --test test/logic.test.mjs` — exercises `logic.js` only (it is DOM-free by boundary
rule). Cases:
- flood fill opens exactly the expected zero-region + numbered border (hand-built boards)
- first click always lands inside the safe zone; no mine ever in the 3×3 zone
- no-guess validator: known-solvable board passes; hand-built board requiring a 50/50 guess fails
- no-guess generation returns a board the validator accepts (sampled across difficulties)
- 3BV on hand-computed boards
- seeded RNG determinism (same seed → same board; different seed → different board)
- chord condition: fires exactly when flag count == number; does not fire otherwise
- win detection (all safe revealed) and lose detection (mine revealed)
- custom mine clamp: `mines = min(input, rows*cols − 9)`, floor 1

**UI verification** (manual, by playing): theme toggle, sound toggle, daily button, custom
form, reset cycles, long-press flag on touch (or emulated), keyboard play-through of a
Beginner board, win and lose sequences.

## 9. Deployment

1. Push the repo to GitHub (main branch, site at repo root)
2. Enable GitHub Pages (source: main branch, / root)
3. All asset paths are relative (`./js/...`) so it also works under a project-page subpath

Zero build step, zero CI required in v1. The test suite runs locally: `node --test`.
CI workflow is a v2 candidate if it becomes wanted.

## 10. v2 candidates (explicitly deferred)

Mid-game auto-save · PWA/installability · CI pipeline · global leaderboards or accounts
(only if a backend is ever added) · sound packs · additional themes · personal statistics
page · more board-generation modes (e.g. "pure intellect" density presets).
