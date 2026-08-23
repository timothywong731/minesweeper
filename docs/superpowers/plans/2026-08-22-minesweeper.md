# Minesweeper (Online) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a classic-feel online Minesweeper (Windows 95 look) with no-guess boards, a daily challenge, custom sizes, 3BV, themes, sound, and full mouse/touch/keyboard play — a zero-dependency static site for GitHub Pages.

**Architecture:** Four JS modules with one boundary each: `logic.js` (pure, DOM-free, node-testable), `game.js` (state + rules + persistence), `ui.js` (rendering + input + WebAudio), `main.js` (bootstrap). All board logic is deterministic pure functions of `(rows, cols, mines, mode, seed, safeIndex)`, which makes no-guess retry, daily challenges, and node testing work.

**Tech Stack:** Vanilla HTML/CSS/JS, ES modules, zero dependencies, zero build. Tests via `node --test` (Node 18+). No frameworks, no npm, no CDN.

**Spec:** `docs/superpowers/specs/2026-08-22-minesweeper-design.md`

## Global Constraints

Every task's requirements implicitly include these (values copied verbatim from the spec):

- Zero dependencies, zero build step; ES modules; all assets local; **no external requests of any kind**
- Grids: Beginner 9×9/10, Intermediate 16×16/40, Expert 16×30/99; Custom 5–30 per side, mines clamped to `[1, rows×cols − 9]`
- First click is always safe: mines placed after first click, excluding the clicked cell's 3×3 zone
- No-guess: perfect-player validation (flood fill + `needed===0 → reveal unknowns` + `needed===unknowns → flag unknowns`), retry up to **10,000** seeds, best-effort fallback with `noGuessSolved: false`
- Daily seed = local calendar date as integer `YYYYMMDD` (e.g. `20260822`); daily challenge is always no-guess mode
- Timer: 1-second ticks, starts on first click, clamped 0–999; mine counter: `mines − flags`, clamped −99…mines
- localStorage keys exactly: `minesweeper.settings` and `minesweeper.best`
- Long-press ≥ **400 ms** = right-click; cell size = `min(28px, floor((viewportWidth − 32px) / cols))`, floor 12px; board scrolls horizontally below the floor
- Sound: WebAudio-synthesized (no audio files), each ≤ 300 ms, default on
- Marker cycle: none → flag → question → none; chord counts **flags only**; left-click on a question-marked cell reveals it
- Test command: `node --test test/logic.test.mjs`
- Commit after every task

## File Structure

```
minesweeper/
├── index.html              # markup: header controls, HUD (LEDs + smiley), board well, status line
├── style.css               # all styling; CSS custom properties for classic/dark themes
├── favicon.svg             # mine icon (also apple-touch-icon)
├── js/
│   ├── logic.js            # pure functions, zero DOM — tested in node
│   ├── game.js             # state object, rule application, timer, settings/best persistence
│   ├── ui.js               # rendering, mouse/touch/keyboard input, WebAudio sfx
│   └── main.js             # bootstrap: load settings → create game → wire header controls
└── test/
    └── logic.test.mjs      # node --test; imports logic.js only
```

**Boundary rule (enforced by every task):** `logic.js` never touches the DOM, storage, or time. `game.js` may use `localStorage`/`setInterval` but never the DOM. `ui.js` never mutates game state directly — it calls `game.js` actions. `main.js` only wires things together.

---

### Task 1: Scaffold + test harness + seeded RNG

**Files:**
- Create: `index.html`, `style.css`, `favicon.svg`, `js/logic.js`, `js/main.js`, `test/logic.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `mulberry32(seed) → () => number in [0,1)` — used by every later task's placement logic

- [ ] **Step 1: Write the failing test**

Create `test/logic.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../js/logic.js';

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('mulberry32 different seeds produce different streams', () => {
  const a = [mulberry32(1)(), mulberry32(1)(), mulberry32(1)(), mulberry32(1)(), mulberry32(1)()];
  const b = [mulberry32(2)(), mulberry32(2)(), mulberry32(2)(), mulberry32(2)(), mulberry32(2)()];
  assert.notDeepEqual(a, b);
});

test('mulberry32 values stay in [0, 1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/logic.test.mjs`
Expected: FAIL — `Cannot find module .../js/logic.js` (or "mulberry32 is not a function")

- [ ] **Step 3: Implement the minimal code**

Create `js/logic.js`:

```js
// Pure Minesweeper logic. No DOM, no storage, no globals.
// Board coordinates: flat index i = row * cols + col.

// 32-bit deterministic PRNG (mulberry32). Same seed → same stream,
// on Node and in every modern browser.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/logic.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Create the page shell**

Create `index.html`:

```html
<!doctype html>
<html lang="en" data-theme="classic">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Minesweeper</title>
  <meta name="description" content="Classic Minesweeper in your browser — no-guess boards, daily challenge, chording, and the original smiley.">
  <link rel="icon" href="./favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="./favicon.svg">
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main class="app">
    <header class="bar">
      <select id="difficulty" aria-label="Difficulty">
        <option value="beginner">Beginner</option>
        <option value="intermediate">Intermediate</option>
        <option value="expert">Expert</option>
        <option value="custom">Custom…</option>
      </select>
      <select id="mode" aria-label="Board mode">
        <option value="classic">Random</option>
        <option value="noguess">No-guess</option>
      </select>
      <button id="daily" type="button">Daily</button>
      <span class="spacer"></span>
      <button id="sound" type="button" aria-pressed="true" aria-label="Toggle sound">🔊</button>
      <button id="theme" type="button" aria-pressed="false" aria-label="Toggle theme">🌗</button>
    </header>

    <form id="custom" class="hidden" autocomplete="off">
      <label>Rows <input id="c-rows" type="number" min="5" max="30" value="16"></label>
      <label>Cols <input id="c-cols" type="number" min="5" max="30" value="16"></label>
      <label>Mines <input id="c-mines" type="number" min="1" max="200" value="40"></label>
      <button type="submit">Play</button>
    </form>

    <section class="hud">
      <div class="led" id="mine-counter" aria-label="Mines remaining">010</div>
      <button id="smiley" type="button" aria-label="New game">🙂</button>
      <div class="led" id="timer" aria-label="Time in seconds">000</div>
    </section>

    <div class="well">
      <div id="board" class="board" aria-label="Minesweeper board"></div>
    </div>

    <p id="status" class="status" role="status"></p>
  </main>
  <script type="module" src="./js/main.js"></script>
</body>
</html>
```

Create `style.css` (layout + both themes; cell/number/HUD styling grows in later tasks):

```css
/* ---- theme tokens ---- */
:root {
  --bg: #008080;            /* Windows 95 teal desktop */
  --face: #c0c0c0;
  --face-light: #ffffff;
  --face-dark: #808080;
  --face-darker: #404040;
  --cell: #c0c0c0;
  --cell-revealed: #d4d0c8;
  --cell-font: 16px;
  --led-bg: #000;
  --led-fg: #ff0000;
  --text: #000;
  --n1: #0000ff; --n2: #008000; --n3: #ff0000; --n4: #000080;
  --n5: #800000; --n6: #008080; --n7: #000000; --n8: #808080;
  --mine-bg: #ffdddd;
}
:root[data-theme='dark'] {
  --bg: #1a1a1f;
  --face: #2e2e36;
  --face-light: #4a4a55;
  --face-dark: #14141a;
  --face-darker: #0a0a0e;
  --cell: #3a3a44;
  --cell-revealed: #23232b;
  --led-fg: #ffaa00;
  --text: #e8e8ec;
  --n1: #5c9dff; --n2: #4caf50; --n3: #ff6b6b; --n4: #9db4ff;
  --n5: #d98c8c; --n6: #52c5c5; --n7: #f0f0f0; --n8: #9a9aa5;
  --mine-bg: #5a2020;
}

/* ---- base ---- */
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Segoe UI', Tahoma, sans-serif;
  display: flex;
  justify-content: center;
  padding: 16px 8px;
}
.app { display: flex; flex-direction: column; gap: 10px; align-items: center; }
.hidden { display: none !important; }

/* ---- 95-style chrome ---- */
.bar, .hud, .well {
  background: var(--face);
  border-top: 2px solid var(--face-light);
  border-left: 2px solid var(--face-light);
  border-right: 2px solid var(--face-dark);
  border-bottom: 2px solid var(--face-dark);
  padding: 8px;
}
.bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: center; }
.spacer { flex: 1; }
.bar select, .bar button, #custom button, #custom input {
  font: inherit;
  background: var(--face);
  color: var(--text);
  border-top: 2px solid var(--face-light);
  border-left: 2px solid var(--face-light);
  border-right: 2px solid var(--face-dark);
  border-bottom: 2px solid var(--face-dark);
  padding: 3px 8px;
}
.bar button:active, #smiley:active {
  border-top: 2px solid var(--face-dark);
  border-left: 2px solid var(--face-dark);
  border-right: 2px solid var(--face-light);
  border-bottom: 2px solid var(--face-light);
}
#custom { display: flex; gap: 8px; align-items: center; }

/* ---- HUD ---- */
.hud { display: flex; gap: 12px; align-items: center; justify-content: space-between; }
.led {
  background: var(--led-bg);
  color: var(--led-fg);
  font: bold 26px 'Courier New', monospace;
  letter-spacing: 3px;
  padding: 2px 6px;
  border: 2px solid var(--face-dark);
  text-shadow: 0 0 5px var(--led-fg);
  min-width: 78px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
#smiley {
  font-size: 28px;
  line-height: 1;
  padding: 2px 8px;
  background: var(--face);
  border-top: 3px solid var(--face-light);
  border-left: 3px solid var(--face-light);
  border-right: 3px solid var(--face-dark);
  border-bottom: 3px solid var(--face-dark);
  cursor: pointer;
}
.well {
  border-top: 3px solid var(--face-dark);
  border-left: 3px solid var(--face-dark);
  border-right: 3px solid var(--face-light);
  border-bottom: 3px solid var(--face-light);
  padding: 6px;
  max-width: 100%;
  overflow: auto;   /* expert width on phones scrolls here, never the page */
}
.status { margin: 0; min-height: 1.2em; font-size: 14px; }

/* ---- board ---- */
.board {
  display: grid;
  gap: 0;
  --cell-size: 28px;
  grid-template-columns: repeat(9, var(--cell-size));
}
.cell {
  width: var(--cell-size);
  height: var(--cell-size);
  padding: 0;
  background: var(--cell);
  border-top: 3px solid var(--face-light);
  border-left: 3px solid var(--face-light);
  border-right: 3px solid var(--face-dark);
  border-bottom: 3px solid var(--face-dark);
  display: grid;
  place-items: center;
  font: bold var(--cell-font) 'Courier New', monospace;
  color: var(--text);
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
}
.cell.revealed {
  border: 1px solid var(--face-dark);
  background: var(--cell-revealed);
  cursor: default;
}
.cell.n1 { color: var(--n1); } .cell.n2 { color: var(--n2); }
.cell.n3 { color: var(--n3); } .cell.n4 { color: var(--n4); }
.cell.n5 { color: var(--n5); } .cell.n6 { color: var(--n6); }
.cell.n7 { color: var(--n7); } .cell.n8 { color: var(--n8); }
.cell.mine { background: var(--mine-bg); }
.cell.exploded { background: #ff0000; }
.cell.cursor { outline: 2px solid var(--n4); outline-offset: -2px; }
.cell:disabled { cursor: default; }
```

Create `favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#008080"/>
  <g stroke="#000" stroke-width="2" stroke-linecap="round">
    <line x1="16" y1="4"  x2="16" y2="28"/>
    <line x1="4"  y1="16" x2="28" y2="16"/>
    <line x1="7"  y1="7"  x2="25" y2="25"/>
    <line x1="25" y1="7"  x2="7"  y2="25"/>
  </g>
  <circle cx="16" cy="16" r="9" fill="#000"/>
  <circle cx="13" cy="13" r="2.5" fill="#fff"/>
</svg>
```

Create a minimal `js/main.js` (wired up fully in Task 8):

```js
// Bootstrap — full wiring lands in Task 8.
console.log('minesweeper shell loaded');
```

- [ ] **Step 6: Verify the shell renders**

Run: open `index.html` in a browser (double-click or `npx -y serve` if preferred).
Expected: teal desktop background, 95-style header bar with the four controls, HUD with two red LED boxes reading `010` and `000` and a 🙂 button, an empty sunken well. No console errors.

- [ ] **Step 7: Commit**

```bash
git add index.html style.css favicon.svg js/logic.js js/main.js test/logic.test.mjs
git commit -m "feat: page shell, base 95 styling, test harness, seeded RNG"
```

---

### Task 2: Grid primitives (createGrid, neighbors, clampMines)

**Files:**
- Modify: `js/logic.js`
- Test: `test/logic.test.mjs`

**Interfaces:**
- Consumes: `mulberry32` (Task 1) — not used yet
- Produces:
  - `createGrid(rows, cols) → { rows, cols, cells }` where `cells[i] = { mine: false, revealed: false, marker: 'none', adjacent: 0 }` and `i = row * cols + col`
  - `neighbors(grid, i) → int[]` — the 8-neighborhood of `i`, clipped to the board, in a stable order (row-major)
  - `clampMines(rows, cols, n) → int` — clamped to `[1, rows*cols − 9]`

- [ ] **Step 1: Write the failing tests**

Append to `test/logic.test.mjs`:

```js
import { createGrid, neighbors, clampMines } from '../js/logic.js';

test('createGrid: shape and default cell state', () => {
  const g = createGrid(2, 3);
  assert.equal(g.rows, 2);
  assert.equal(g.cols, 3);
  assert.equal(g.cells.length, 6);
  assert.deepEqual(g.cells[0], { mine: false, revealed: false, marker: 'none', adjacent: 0 });
});

test('neighbors: corner has 3, edge has 5, center has 8', () => {
  const g = createGrid(3, 3);
  assert.equal(neighbors(g, 0).length, 3);
  assert.equal(neighbors(g, 1).length, 5);
  assert.equal(neighbors(g, 4).length, 8);
});

test('neighbors: never leaves the board', () => {
  const g = createGrid(2, 2);
  for (let i = 0; i < 4; i++) {
    for (const j of neighbors(g, i)) assert(j >= 0 && j < 4);
  }
});

test('clampMines: bounds and pass-through', () => {
  assert.equal(clampMines(5, 5, 99), 16);   // 25 - 9
  assert.equal(clampMines(5, 5, 0), 1);
  assert.equal(clampMines(5, 5, -3), 1);
  assert.equal(clampMines(9, 9, 10), 10);
  assert.equal(clampMines(16, 30, 99), 99);
});
```

Note: the file must now import both modules — restructure the import line at the top to:

```js
import { mulberry32, createGrid, neighbors, clampMines } from '../js/logic.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/logic.test.mjs`
Expected: FAIL — `createGrid is not a function` (5 new tests fail, 3 RNG tests still pass)

- [ ] **Step 3: Implement**

Append to `js/logic.js`:

```js
export function createGrid(rows, cols) {
  const cells = Array.from({ length: rows * cols }, () => ({
    mine: false,
    revealed: false,
    marker: 'none',   // 'none' | 'flag' | 'q'
    adjacent: 0,
  }));
  return { rows, cols, cells };
}

export function neighbors(grid, i) {
  const { rows, cols } = grid;
  const r = Math.floor(i / cols);
  const c = i % cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
    }
  }
  return out;
}

export function clampMines(rows, cols, n) {
  const max = rows * cols - 9;
  return Math.max(1, Math.min(Math.round(n), max));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/logic.test.mjs`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add js/logic.js test/logic.test.mjs
git commit -m "feat: grid primitives — createGrid, neighbors, clampMines"
```

---

### Task 3: Mine placement with safe first click

**Files:**
- Modify: `js/logic.js`
- Test: `test/logic.test.mjs`

**Interfaces:**
- Consumes: `mulberry32`, `createGrid`, `neighbors`
- Produces: `placeMines(grid, seed, safeIndex, mines) → grid` (mutates and returns `grid`) — mines chosen uniformly from all cells except the `safeIndex` 3×3 zone; non-mine cells get their `adjacent` count; fully deterministic per `(grid, seed, safeIndex, mines)`

- [ ] **Step 1: Write the failing tests**

Add to the import line: `placeMines`. Append tests:

```js
test('placeMines: exact mine count, safe zone untouched', () => {
  const g = placeMines(createGrid(5, 5), 123, 12, 10);
  const mines = g.cells.filter((c) => c.mine).length;
  assert.equal(mines, 10);
  const safe = new Set([12, ...neighbors(g, 12)]);
  for (let i = 0; i < g.cells.length; i++) {
    if (g.cells[i].mine) assert(!safe.has(i), `mine at ${i} inside safe zone`);
  }
});

test('placeMines: adjacent counts match the mine layout', () => {
  const g = placeMines(createGrid(5, 5), 123, 12, 10);
  for (let i = 0; i < g.cells.length; i++) {
    if (!g.cells[i].mine) {
      const expect = neighbors(g, i).filter((j) => g.cells[j].mine).length;
      assert.equal(g.cells[i].adjacent, expect);
    }
  }
});

test('placeMines: deterministic for a seed, different across seeds', () => {
  const a = placeMines(createGrid(5, 5), 123, 12, 10).cells.map((c) => c.mine);
  const b = placeMines(createGrid(5, 5), 123, 12, 10).cells.map((c) => c.mine);
  const c = placeMines(createGrid(5, 5), 456, 12, 10).cells.map((c) => c.mine);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/logic.test.mjs`
Expected: FAIL — `placeMines is not a function`

- [ ] **Step 3: Implement**

Append to `js/logic.js`:

```js
// Choose `mines` cells uniformly from everything outside safeIndex's 3x3 zone
// (Fisher-Yates partial shuffle over the eligible pool), then count neighbors.
export function placeMines(grid, seed, safeIndex, mines) {
  const rng = mulberry32(seed);
  const n = grid.rows * grid.cols;
  const excluded = new Set([safeIndex, ...neighbors(grid, safeIndex)]);
  const pool = [];
  for (let i = 0; i < n; i++) if (!excluded.has(i)) pool.push(i);
  for (let k = 0; k < mines; k++) {
    const j = k + Math.floor(rng() * (pool.length - k));
    [pool[k], pool[j]] = [pool[j], pool[k]];
  }
  for (const i of pool.slice(0, mines)) grid.cells[i].mine = true;
  for (let i = 0; i < n; i++) {
    if (!grid.cells[i].mine) {
      grid.cells[i].adjacent = neighbors(grid, i).filter((j) => grid.cells[j].mine).length;
    }
  }
  return grid;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/logic.test.mjs`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add js/logic.js test/logic.test.mjs
git commit -m "feat: seeded mine placement with guaranteed-safe first click"
```

---

### Task 4: Flood-fill reveal

**Files:**
- Modify: `js/logic.js`
- Test: `test/logic.test.mjs`

**Interfaces:**
- Consumes: `createGrid`, `neighbors`, `placeMines`
- Produces: `reveal(grid, i) → { opened: int[], exploded: bool }` — mutates `grid`: reveals cell `i`; if it is a mine returns `{ opened: [i], exploded: true }` (cell marked revealed); if it is a zero cell, cascade-reveals the whole connected zero region **plus** its numbered border; no mine is ever revealed by a cascade. Revealing an already-revealed cell returns `{ opened: [], exploded: false }`.

Test helper — add once to `test/logic.test.mjs` (used by tasks 4, 5, 6, 7):

```js
// Build a board from an ASCII map.
// '.' hidden safe · '#' hidden mine · '0' revealed zero · '1'-'8' revealed number
// 'F' hidden flagged
function board(map) {
  const rows = map.length;
  const cols = map[0].length;
  const g = createGrid(rows, cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = map[r][c];
      const cell = g.cells[r * cols + c];
      if (ch === '#') { cell.mine = true; continue; }
      if (ch === 'F') { cell.marker = 'flag'; continue; }
      const n = parseInt(ch, 10);
      if (n >= 0) { cell.revealed = true; cell.adjacent = n; }
    }
  }
  return g;
}
```

Note the boards below are hand-built and internally consistent (each revealed number equals its mine neighbors); they model the board *after* the first click has opened the top row.

- [ ] **Step 1: Write the failing tests**

Add `reveal` to the import. Append:

```js
const MAP_SOLVE = ['000', '011', '01#'];   // mine at (2,2); top row opened by first click

test('reveal: zero flood opens region + numbered border, never mines', () => {
  const g = board(MAP_SOLVE);
  const { opened, exploded } = reveal(g, 0);
  assert.equal(exploded, false);
  assert.deepEqual([...opened].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(g.cells[8].revealed, false, 'mine must stay hidden');
});

test('reveal: numbered cell opens only itself', () => {
  const g = board(['1', 'F']);            // (0,0)=1 revealed, (1,0) flagged
  const g2 = createGrid(1, 2);
  g2.cells[1].mine = true;
  g2.cells[0].adjacent = 1;
  const { opened, exploded } = reveal(g2, 0);
  assert.deepEqual(opened, [0]);
  assert.equal(exploded, false);
});

test('reveal: mine → exploded', () => {
  const g = createGrid(1, 1);
  g.cells[0].mine = true;
  const { opened, exploded } = reveal(g, 0);
  assert.deepEqual(opened, [0]);
  assert.equal(exploded, true);
  assert.equal(g.cells[0].revealed, true);
});

test('reveal: already-revealed cell is a no-op', () => {
  const g = board(MAP_SOLVE);
  const r = reveal(g, 0);
  assert.deepEqual(r, { opened: [], exploded: false });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/logic.test.mjs`
Expected: FAIL — `reveal is not a function`

- [ ] **Step 3: Implement**

Append to `js/logic.js`:

```js
// Reveal cell i. Zero cells cascade through their safe neighborhood;
// numbered cells stop the cascade. Mines are never opened by a cascade.
export function reveal(grid, i) {
  const cell = grid.cells[i];
  if (cell.revealed) return { opened: [], exploded: false };
  if (cell.mine) {
    cell.revealed = true;
    return { opened: [i], exploded: true };
  }
  const opened = [];
  const stack = [i];
  while (stack.length) {
    const j = stack.pop();
    const cj = grid.cells[j];
    if (cj.revealed || cj.mine) continue;
    cj.revealed = true;
    opened.push(j);
    if (cj.adjacent === 0) {
      for (const k of neighbors(grid, j)) {
        const ck = grid.cells[k];
        if (!ck.revealed && !ck.mine) stack.push(k);
      }
    }
  }
  return { opened, exploded: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/logic.test.mjs`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add js/logic.js test/logic.test.mjs
git commit -m "feat: flood-fill reveal with numbered border"
```

---

### Task 5: Chording and marker cycling

**Files:**
- Modify: `js/logic.js`
- Test: `test/logic.test.mjs`

**Interfaces:**
- Consumes: `createGrid`, `neighbors`
- Produces:
  - `chordTargets(grid, i) → int[]` — for a revealed numbered cell `i` whose **flag count in neighbors equals its number**: the indices of hidden, unmarked neighbors (empty if ineligible or nothing to reveal). Question marks are *not* counted as flags and *not* returned.
  - `cycleMarker(marker) → 'flag' | 'q' | 'none'` — none→flag, flag→q, q→none

- [ ] **Step 1: Write the failing tests**

Add `chordTargets, cycleMarker` to the import. Append:

```js
test('cycleMarker: none → flag → q → none', () => {
  assert.equal(cycleMarker('none'), 'flag');
  assert.equal(cycleMarker('flag'), 'q');
  assert.equal(cycleMarker('q'), 'none');
});

const MAP_CHORD = ['.', '2', '.'];  // 1 col wide is invalid; use 3x3 below instead
const MAP_CHORD2 = [
  '.2.',
  'F.F',
  '.2.',
];

test('chordTargets: flags == number → unmarked hidden neighbors', () => {
  const g = board(MAP_CHORD2);
  assert.deepEqual(chordTargets(g, 4), [0, 2, 6, 8]);
});

test('chordTargets: flags < number → []', () => {
  const g = board(['.2.', 'F..', '.2.']);   // only (1,0) flagged
  assert.deepEqual(chordTargets(g, 4), []);
});

test('chordTargets: revealed zero cell → [] (not chordable)', () => {
  const g = board(['0', '0', '0']);
  assert.deepEqual(chordTargets(g, 0), []);
});

test('chordTargets: hidden cell → []', () => {
  const g = board(['.', '.']);
  assert.deepEqual(chordTargets(g, 0), []);
});
```

(Remove the `MAP_CHORD` constant — it was a scratch line; `MAP_CHORD2` is the one used.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/logic.test.mjs`
Expected: FAIL — `chordTargets is not a function`

- [ ] **Step 3: Implement**

Append to `js/logic.js`:

```js
// Classic chord: revealed number with exactly `number` flags around it
// opens every remaining unmarked neighbor. Question marks count as neither.
export function chordTargets(grid, i) {
  const cell = grid.cells[i];
  if (!cell.revealed || cell.adjacent === 0) return [];
  const ns = neighbors(grid, i);
  const flags = ns.filter((j) => grid.cells[j].marker === 'flag').length;
  if (flags !== cell.adjacent) return [];
  return ns.filter((j) => !grid.cells[j].revealed && grid.cells[j].marker === 'none');
}

export function cycleMarker(marker) {
  return marker === 'none' ? 'flag' : marker === 'flag' ? 'q' : 'none';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/logic.test.mjs`
Expected: PASS (21 tests)

- [ ] **Step 5: Commit**

```bash
git add js/logic.js test/logic.test.mjs
git commit -m "feat: chording and marker cycling"
```

---

### Task 6: Win detection and 3BV

**Files:**
- Modify: `js/logic.js`
- Test: `test/logic.test.mjs`

**Interfaces:**
- Consumes: `createGrid`, `neighbors`, `reveal`
- Produces:
  - `isWin(grid) → bool` — every cell is a mine or revealed
  - `cloneGrid(grid) → grid` — deep copy (cells are plain objects, so a per-cell spread copy suffices)
  - `threeBV(grid) → int` — number of clicks a perfect solver needs: simulate opening on a clone; each click reveals one connected zero-region (flood) including numbered border; never mutates the input

- [ ] **Step 1: Write the failing tests**

Add `isWin, cloneGrid, threeBV` to the import. Append:

```js
test('isWin: all safe cells revealed → true', () => {
  assert.equal(isWin(board(['000', '011', '01#'])), true);
});

test('isWin: hidden safe cell remains → false', () => {
  assert.equal(isWin(board(['0', '.', '#'])), false);
});

test('cloneGrid: independent copy', () => {
  const g = board(['0', '.']);
  const c = cloneGrid(g);
  c.cells[1].revealed = true;
  assert.equal(g.cells[1].revealed, false);
});

test('threeBV: two isolated zero regions → 2 clicks', () => {
  assert.equal(threeBV(board(['..#', '...', '#..'])), 2);
});

test('threeBV: single flood opens everything → 1 click', () => {
  assert.equal(threeBV(board(['000', '011', '01#'])), 1);
});

test('threeBV: does not mutate the input board', () => {
  const g = board(['..#', '...', '#..']);
  const before = g.cells.map((c) => c.revealed);
  threeBV(g);
  assert.deepEqual(g.cells.map((c) => c.revealed), before);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/logic.test.mjs`
Expected: FAIL — `isWin is not a function`

- [ ] **Step 3: Implement**

Append to `js/logic.js`:

```js
export function isWin(grid) {
  return grid.cells.every((c) => c.mine || c.revealed);
}

export function cloneGrid(grid) {
  return { rows: grid.rows, cols: grid.cols, cells: grid.cells.map((c) => ({ ...c })) };
}

// 3BV (biggest first-move value proxy): minimum clicks to open all safe
// cells — each click opens one connected zero-region plus its numbered border.
export function threeBV(grid) {
  const g = cloneGrid(grid);
  let clicks = 0;
  for (let i = 0; i < g.cells.length; i++) {
    const c = g.cells[i];
    if (c.mine || c.revealed) continue;
    clicks++;
    reveal(g, i);
  }
  return clicks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/logic.test.mjs`
Expected: PASS (27 tests)

- [ ] **Step 5: Commit**

```bash
git add js/logic.js test/logic.test.mjs
git commit -m "feat: win detection and 3BV computation"
```

---

### Task 7: No-guess solver + board generator

**Files:**
- Modify: `js/logic.js`
- Test: `test/logic.test.mjs`

**Interfaces:**
- Consumes: `createGrid`, `neighbors`, `placeMines`, `reveal`, `isWin`, `cloneGrid`
- Produces:
  - `solverSolves(grid, start) → bool` — perfect-player simulation on a **clone**: opens `start`, then loops over revealed numbered cells applying exactly two inferences: (a) `needed === 0` (all its mines already flagged) → reveal all unmarked hidden neighbors; (b) `needed === unknownCount` → flag all unmarked hidden neighbors. `needed = adjacent − flaggedNeighbors`, `unknowns` = hidden, unmarked neighbors (mines *included* — the solver doesn't know which are mines). Returns `isWin` after no further inference is possible. Inconsistent board (mines required beyond available unknowns) → `false`.
  - `generate({ rows, cols, mines, mode, seed, safeIndex, maxAttempts = 10000 }) → { grid, noGuessSolved }` — `mode: 'classic'`: one `placeMines`. `mode: 'noguess'`: try seeds `seed, seed+1, …` up to `maxAttempts` until `solverSolves` passes; on exhaustion return the first-attempt board with `noGuessSolved: false`.

**Design note (deviation from spec's letter, same intent):** the spec's third inference rule — "a `1` with exactly one unknown neighbor → safe" — is subsumed by rule (a) when that `1`'s mine is already flagged, which is the only case where the unknown is actually *safe*. The implementation uses the two general rules, which is the standard "simple solver" no-guess definition and is strictly more permissive in a safe direction.

- [ ] **Step 1: Write the failing tests**

Add `solverSolves, generate` to the import. Append:

```js
// Valid board: mines at (1,0) and (1,2). Top row is revealed 1,2,1.
// Local logic can't decide between (1,0)/(1,1)/(1,2) — a 50/50 wall.
const MAP_STUCK = ['121', '...', '...'];
MAP_STUCK;

// Build it with mines explicit (the map helper treats '#' as hidden mine):
const STUCK_MAP = [
  '121',
  '#.#',
  '...',
];

test('solverSolves: board requiring a guess → false', () => {
  const g = board(STUCK_MAP);
  assert.equal(solverSolves(g, 0), false);
});

test('solverSolves: logically solvable board → true', () => {
  const g = board(MAP_SOLVE);   // flood + "1 with one unknown → flag" solves it
  assert.equal(solverSolves(g, 0), true);
});

test('generate classic: exact mines, safe zone clear', () => {
  const { grid } = generate({ rows: 9, cols: 9, mines: 10, mode: 'classic', seed: 99, safeIndex: 40 });
  assert.equal(grid.cells.filter((c) => c.mine).length, 10);
  const safe = new Set([40, ...neighbors(grid, 40)]);
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.cells[i].mine) assert(!safe.has(i));
  }
});

test('generate noguess: returned board always passes the solver', () => {
  const cases = [[9, 9, 10], [16, 16, 40], [16, 30, 99]];
  for (const [rows, cols, mines] of cases) {
    const start = Math.floor((rows * cols) / 2);
    const { grid, noGuessSolved } = generate({
      rows, cols, mines, mode: 'noguess', seed: 1, safeIndex: start,
    });
    assert.equal(noGuessSolved, true);
    assert.equal(solverSolves(grid, start), true);
    assert.equal(grid.cells.filter((c) => c.mine).length, mines);
  }
});

test('generate noguess: exhausted attempts still yield a valid board', () => {
  const { grid, noGuessSolved } = generate({
    rows: 5, cols: 5, mines: 12, mode: 'noguess', seed: 5, safeIndex: 12, maxAttempts: 1,
  });
  assert.equal(typeof noGuessSolved, 'boolean');
  assert.equal(grid.cells.filter((c) => c.mine).length, 12);
  const safe = new Set([12, ...neighbors(grid, 12)]);
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.cells[i].mine) assert(!safe.has(i));
  }
});
```

(Delete the stray `MAP_STUCK;` line — `STUCK_MAP` is the board used.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/logic.test.mjs`
Expected: FAIL — `solverSolves is not a function`

- [ ] **Step 3: Implement**

Append to `js/logic.js`:

```js
// Perfect player: flood fills + two local inferences only (no case-splitting).
// Returns true iff it can clear the board starting from `start`.
export function solverSolves(grid, start) {
  const g = cloneGrid(grid);
  reveal(g, start);
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < g.cells.length; i++) {
      const c = g.cells[i];
      if (!c.revealed || c.adjacent === 0) continue;
      const ns = neighbors(g, i);
      const unknowns = ns.filter((j) => !g.cells[j].revealed && g.cells[j].marker === 'none');
      const flagged = ns.filter((j) => g.cells[j].marker === 'flag').length;
      const needed = c.adjacent - flagged;
      if (unknowns.length === 0) {
        if (needed > 0) return false;      // inconsistent board
        continue;
      }
      if (needed === 0) {
        for (const j of unknowns) { reveal(g, j); progress = true; }
      } else if (needed === unknowns.length) {
        for (const j of unknowns) { g.cells[j].marker = 'flag'; progress = true; }
      }
    }
  }
  return isWin(g);
}

export function generate({ rows, cols, mines, mode, seed, safeIndex, maxAttempts = 10000 }) {
  const attempt = (s) => placeMines(createGrid(rows, cols), s, safeIndex, mines);
  if (mode === 'noguess') {
    for (let s = seed; s < seed + maxAttempts; s++) {
      const grid = attempt(s);
      if (solverSolves(grid, safeIndex)) return { grid, noGuessSolved: true };
    }
    return { grid: attempt(seed), noGuessSolved: false };   // spec: best-effort, game stays playable
  }
  return { grid: attempt(seed), noGuessSolved: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/logic.test.mjs`
Expected: PASS (32 tests). If `generate noguess` is slow, run once with `time node --test test/logic.test.mjs` — the expert board should generate in well under a second; if it isn't, the solver has a loop bug (check the `progress` flag), don't optimize.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js test/logic.test.mjs
git commit -m "feat: perfect-player solver and no-guess board generator"
```

---

### Task 8: Game state, rules, and persistence (`js/game.js`)

**Files:**
- Create: `js/game.js`

**Interfaces:**
- Consumes: `logic.js` (all of it)
- Produces (used by `ui.js`/`main.js` in Tasks 9–10):
  - `DIFFICULTIES` — `{ beginner: {rows,cols,mines}, intermediate, expert }`
  - `loadSettings() → settings`, `saveSettings(settings)`, `loadBest() → object`, `saveBest(object)`
  - `settings` shape: `{ difficulty: 'beginner'|'intermediate'|'expert'|'custom', custom: null | {rows,cols,mines}, mode: 'classic'|'noguess', theme: 'classic'|'dark', sound: bool }`
  - `bestKey(settings, { daily, date }) → string` — e.g. `'expert'`, `'custom-16x16x40'`, `'daily-20260822-beginner'`
  - `gridSize(settings) → { rows, cols, mines }`
  - `dailySeed() → int` — `YYYYMMDD` from the local calendar date
  - `createGame(settings, { daily }) → gameObj` — gameObj: `{ settings, rows, cols, mines, daily, seed, status: 'waiting', grid: null, time, flags, threeBV, noGuessSolved, explodedIndex, onTick }`
  - `startTimer(gameObj)`, `stopTimer()`
  - `countFlags(gameObj) → int`
  - `revealCell(gameObj, i)` — on a `'waiting'` game this is the first click: `generate()` places mines, then reveals; on `'playing'` reveals (or chords nothing) one cell
  - `chordCell(gameObj, i)` — reveals `chordTargets`, explodes if a target is a mine
  - `toggleMarker(gameObj, i)`, `setMarker(gameObj, i, 'flag'|'q'|'none')`
  - `newBoard(gameObj, settings, { daily })` — resets the game object in place (timer stopped, `onTick` callback preserved)
  - Win/lose are automatic inside the actions: `status` becomes `'won'` (all mines auto-flagged, best time recorded) or `'lost'` (all mines revealed, `explodedIndex` set). `gameObj.onTick` (a callback main.js assigns) fires each second.

**Rules baked in (from spec §4):** first click always safe; mines placed only after first click; timer starts on first click, 1s ticks, clamped at 999; counter shows `mines − flags` (may go negative); flag/question never reveals; marker unavailable before the first click (board doesn't exist yet); chording reveals only when flags match; win = all safe cells open; daily = same-day seed, always `noguess` mode, best time keyed by date.

- [ ] **Step 1: Create `js/game.js`**

```js
// Game state + rules + persistence. No DOM. localStorage + setInterval allowed.
import { generate, reveal, chordTargets, cycleMarker, isWin, threeBV, clampMines } from './logic.js';

const SETTINGS_KEY = 'minesweeper.settings';
const BEST_KEY = 'minesweeper.best';

export const DIFFICULTIES = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

export function defaultSettings() {
  return { difficulty: 'beginner', custom: null, mode: 'classic', theme: 'classic', sound: true };
}

export function loadSettings() {
  try { return { ...defaultSettings(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }; }
  catch { return defaultSettings(); }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage blocked: play on */ }
}
export function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) ?? {}; } catch { return {}; }
}
export function saveBest(b) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch { /* storage blocked: play on */ }
}

export function bestKey(settings, { daily = false, date = null } = {}) {
  if (daily) return `daily-${date}-${settings.difficulty}`;
  if (settings.difficulty === 'custom') {
    const c = settings.custom;
    return `custom-${c.rows}x${c.cols}x${clampMines(c.rows, c.cols, c.mines)}`;
  }
  return settings.difficulty;
}

export function gridSize(settings) {
  if (settings.difficulty === 'custom') {
    const c = settings.custom;
    return { rows: c.rows, cols: c.cols, mines: clampMines(c.rows, c.cols, c.mines) };
  }
  return { ...DIFFICULTIES[settings.difficulty] };
}

export function dailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function createGame(settings, { daily = false } = {}) {
  const { rows, cols, mines } = gridSize(settings);
  const s = { ...settings };
  if (daily) s.mode = 'noguess';   // spec: daily is always no-guess
  return {
    settings: s, rows, cols, mines, daily,
    seed: daily ? dailySeed() : (Math.random() * 0x7fffffff) | 0,
    status: 'waiting',            // 'waiting' | 'playing' | 'won' | 'lost'
    grid: null,                   // created on first click — mines don't exist yet (spec §4.1)
    time: 0, flags: 0, threeBV: 0,
    noGuessSolved: true, explodedIndex: null,
    onTick: null,                 // ui/main assigns to redraw the HUD each second
  };
}

let timerId = null;
export function startTimer(g) {
  stopTimer();
  timerId = setInterval(() => {
    if (g.time < 999) g.time++;
    if (g.onTick) g.onTick();
  }, 1000);
}
export function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

export function countFlags(g) {
  return g.grid ? g.grid.cells.filter((c) => c.marker === 'flag').length : 0;
}

export function firstClick(g, i) {
  const { grid, noGuessSolved } = generate({
    rows: g.rows, cols: g.cols, mines: g.mines,
    mode: g.settings.mode, seed: g.seed, safeIndex: i,
  });
  g.grid = grid;
  g.noGuessSolved = noGuessSolved;
  g.threeBV = threeBV(grid);
  g.status = 'playing';
  startTimer(g);
  applyReveal(g, i);
}

function applyReveal(g, i) {
  const { exploded } = reveal(g.grid, i);
  if (exploded) { lose(g, i); return; }
  if (isWin(g.grid)) win(g);
}

export function revealCell(g, i) {
  if (g.status === 'waiting') { firstClick(g, i); return; }
  if (g.status !== 'playing') return;
  const c = g.grid.cells[i];
  if (c.revealed || c.marker === 'flag') return;
  applyReveal(g, i);
}

export function chordCell(g, i) {
  if (g.status !== 'playing') return;
  for (const j of chordTargets(g.grid, i)) {
    if (g.grid.cells[j].mine) { lose(g, j); return; }
    reveal(g.grid, j);
  }
  if (isWin(g.grid)) win(g);
}

export function toggleMarker(g, i) {
  if (g.status !== 'playing') return;   // no board before first click — nothing to mark
  const c = g.grid.cells[i];
  if (c.revealed) return;
  c.marker = cycleMarker(c.marker);
  g.flags = countFlags(g);
}

export function setMarker(g, i, marker) {
  if (g.status !== 'playing') return;
  const c = g.grid.cells[i];
  if (c.revealed) return;
  c.marker = c.marker === marker ? 'none' : marker;
  g.flags = countFlags(g);
}

export function win(g) {
  g.status = 'won';
  stopTimer();
  for (const c of g.grid.cells) if (c.mine && c.marker !== 'flag') c.marker = 'flag';
  g.flags = countFlags(g);
  recordBest(g);
}

function lose(g, explodedIndex) {
  g.status = 'lost';
  g.explodedIndex = explodedIndex;
  stopTimer();
  for (const c of g.grid.cells) if (c.mine) c.revealed = true;
}

function recordBest(g) {
  const best = loadBest();
  const key = bestKey(g.settings, { daily: g.daily, date: dailySeed() });
  const cur = best[key];
  if (!cur || g.time < cur.time) {
    best[key] = { time: g.time, threeBV: g.threeBV };
    saveBest(best);
  }
}

export function newBoard(g, settings, { daily = false } = {}) {
  stopTimer();
  const onTick = g.onTick;
  Object.assign(g, createGame(settings, { daily }));
  g.onTick = onTick;
}
```

- [ ] **Step 2: Import smoke check (Node, no DOM needed)**

Run: `node -e "import('./js/game.js').then(m => console.log(Object.keys(m).join(' ')))"`
Expected: prints all export names (`DIFFICULTIES loadSettings ... newBoard`) with no error. This proves the module graph is valid ES and nothing DOM-only runs at import time.

- [ ] **Step 3: Commit**

```bash
git add js/game.js
git commit -m "feat: game state, rules, timer, and settings/best persistence"
```

---

### Task 9: UI — rendering, input, sound (`js/ui.js`)

**Files:**
- Create: `js/ui.js`

**Interfaces:**
- Consumes: `game.js` actions (`revealCell`, `chordCell`, `toggleMarker`, `setMarker`, `countFlags`), `gameObj`
- Produces: `createUI(g) → { refresh, renderCursor }` — attaches all board event handlers and exposes `refresh()` (redraw board + HUD + status) for use by `main.js` and the tick callback. Also exports `cellSize(g)` used nowhere else (kept local — see Step 1 note).

**Input rules (spec §4.4):** left-click reveals; on a revealed number with the right flag count it chords; right-click cycles marker; long-press (≥ 400 ms, mouse *or* touch) = right-click; question-marked cells reveal on left-click (not chordable, already covered by `logic.js`); board is inert after win/lose.

- [ ] **Step 1: Create `js/ui.js`**

```js
// Rendering, board input, WebAudio sfx. The only module that touches the DOM.
// Calls game.js actions; never mutates game state itself.
import { revealCell, chordCell, toggleMarker, setMarker, countFlags, bestKey, loadBest, dailySeed } from './game.js';

const FACE = { waiting: '🙂', playing: '🙂', won: '😎', lost: '😵' };
const LONG_PRESS_MS = 400;   // spec §4.4

export function createUI(g) {
  const els = {
    board: document.getElementById('board'),
    smiley: document.getElementById('smiley'),
    counter: document.getElementById('mine-counter'),
    timer: document.getElementById('timer'),
    status: document.getElementById('status'),
  };
  const sfx = makeSfx(() => g.settings.sound);

  let pressTimer = null;
  let longFired = false;
  let cursor = 0;

  // ---------- rendering ----------

  function cellSize() {           // spec §7.4: fit the width, 12–28px
    return Math.max(12, Math.min(28, Math.floor((window.innerWidth - 32) / g.cols)));
  }

  function renderBoard() {
    els.board.style.setProperty('--cell-size', cellSize() + 'px');
    els.board.style.gridTemplateColumns = `repeat(${g.cols}, var(--cell-size))`;
    if (!g.grid) { els.board.replaceChildren(); renderCursor(); return; }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < g.grid.cells.length; i++) {
      const c = g.grid.cells[i];
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.i = i;
      if (c.revealed) {
        d.classList.add('revealed');
        if (c.mine) {
          d.classList.add('mine');
          d.textContent = '💣';
          if (i === g.explodedIndex) d.classList.add('exploded');
        } else if (c.adjacent > 0) {
          d.classList.add('n' + c.adjacent);
          d.textContent = c.adjacent;
        }
      } else if (c.marker === 'flag') d.textContent = '🚩';
      else if (c.marker === 'q') d.textContent = '?';
      frag.appendChild(d);
    }
    els.board.replaceChildren(frag);
    renderCursor();
  }

  function renderCursor() {
    for (const d of els.board.children) d.classList.toggle('cursor', Number(d.dataset.i) === cursor);
  }

  function fmt3(n) {              // negative counter allowed (spec §4.4)
    if (n < 0) return '-' + String(Math.min(99, -n)).padStart(2, '0');
    return String(Math.min(999, n)).padStart(3, '0');
  }

  function renderHUD() {
    els.counter.textContent = fmt3(g.mines - countFlags(g));
    els.timer.textContent = fmt3(g.time);
    els.smiley.textContent = FACE[g.status];
    els.smiley.setAttribute('aria-label', 'New game');
  }

  function renderStatus() {
    let msg = '';
    if (g.status === 'won') msg = g.daily ? 'Daily challenge cleared! ' : 'You win! ';
    else if (g.status === 'lost') msg = 'Boom. ';
    if (g.settings.mode === 'noguess' && !g.noGuessSolved) {
      msg += '(best-effort board — no-guess retries exhausted) ';
    }
    const best = loadBest()[bestKey(g.settings, { daily: g.daily, date: dailySeed() })];
    if (best) msg += `Best ${best.time}s · 3BV ${best.threeBV}`;
    els.status.textContent = msg.trim();
  }

  function refresh() { renderBoard(); renderHUD(); renderStatus(); }

  // ---------- sound (WebAudio, no files — spec §7.3) ----------

  function makeSfx(soundOn) {
    let ctx = null;
    const audio = () => {
      if (!soundOn()) return null;
      if (!ctx) ctx = new AudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    };
    const tone = (freq, dur, delay = 0) => {
      const a = audio(); if (!a) return;
      const t = a.currentTime + delay;
      const o = a.createOscillator();
      const gn = a.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      gn.gain.setValueAtTime(0.1, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(gn).connect(a.destination);
      o.start(t); o.stop(t + dur);
    };
    const noise = (dur) => {
      const a = audio(); if (!a) return;
      const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = a.createBufferSource();
      src.buffer = buf;
      const gn = a.createGain();
      gn.gain.value = 0.3;
      src.connect(gn).connect(a.destination);
      src.start();
    };
    return {
      click: () => tone(660, 0.06),
      flag: () => tone(440, 0.08),
      boom: () => noise(0.35),
      win: () => [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.12, k * 0.09)),
    };
  }

  // ---------- input ----------

  function doReveal(i) {
    const before = g.status;
    const c = g.grid && g.grid.cells[i];
    if (c && c.revealed && c.adjacent > 0) chordCell(g, i);   // chord attempt
    else revealCell(g, i);
    soundFor(before);
    refresh();
  }

  function doFlag(i) {
    const before = g.status;
    toggleMarker(g, i);
    if (g.status === before) sfx.flag();
    else soundFor(before);
    refresh();
  }

  function soundFor(before) {
    if (g.status === 'lost') sfx.boom();
    else if (g.status === 'won') sfx.win();
    else if (before === 'playing' || before === 'waiting') sfx.click();
  }

  function cellIndex(e) {
    const cell = e.target.closest('.cell');
    return cell ? Number(cell.dataset.i) : null;
  }

  els.board.addEventListener('contextmenu', (e) => e.preventDefault());

  els.board.addEventListener('pointerdown', (e) => {
    if (cellIndex(e) === null) return;
    longFired = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longFired = true;
      const i = cellIndexFromEventStash(e);
      if (i !== null) doFlag(i);
    }, LONG_PRESS_MS);
  });

  // pointerup/leave need the index — recompute from board state instead of the stale event target
  function cellIndexFromEventStash(stashed) {
    // The long-press timer fires while the pointer is still down on the same cell;
    // e.target is captured by the closure and still valid.
    const cell = stashed.target.closest('.cell');
    return cell ? Number(cell.dataset.i) : null;
  }

  els.board.addEventListener('pointerup', (e) => {
    clearTimeout(pressTimer);
    const i = cellIndex(e);
    if (i === null || longFired) { longFired = false; return; }
    if (e.button === 2) { doFlag(i); return; }
    if (e.button !== 0) return;
    doReveal(i);
  });

  els.board.addEventListener('pointerleave', () => clearTimeout(pressTimer));
  els.board.addEventListener('pointercancel', () => { clearTimeout(pressTimer); longFired = false; });

  // ---------- keyboard (spec §7.5) ----------

  const DIRS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  window.addEventListener('keydown', (e) => {
    const t = e.target.tagName;
    if (t === 'INPUT' || t === 'SELECT' || t === 'BUTTON') return;  // don't steal form/smile keys
    if (DIRS[e.key]) {
      const [dr, dc] = DIRS[e.key];
      const r = Math.max(0, Math.min(g.rows - 1, Math.floor(cursor / g.cols) + dr));
      const c = Math.max(0, Math.min(g.cols - 1, (cursor % g.cols) + dc));
      cursor = r * g.cols + c;
      renderCursor();
      e.preventDefault();
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') { doReveal(cursor); e.preventDefault(); return; }
    if (e.key === 'f' || e.key === 'F') doFlag(cursor);
    if (e.key === 'q' || e.key === 'Q') {
      const before = g.status;
      setMarker(g, cursor, 'q');
      if (g.status === before) sfx.flag();
      refresh();
    }
  });

  window.addEventListener('resize', () => {
    if (g.grid) renderBoard();   // re-fit cell size (spec §7.4)
  });

  function resetCursor() { cursor = 0; }

  return { refresh, resetCursor };
}
```

Step 1 note: `cellSize` and `cellIndexFromEventStash` are module-local by design — the only export is `createUI` (the "used nowhere else" line in Interfaces is a lie guard: nothing else imports them).

- [ ] **Step 2: Verify syntax (Node can import it if DOM access is deferred)**

`ui.js` calls `document.getElementById` only inside `createUI`, so Node import must not crash at module scope:

Run: `node -e "import('./js/ui.js').then(m => console.log('ui exports:', Object.keys(m)))"`
Expected: `ui exports: [ 'createUI' ]`

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: board rendering, mouse/touch/keyboard input, WebAudio sfx"
```

---

### Task 10: Bootstrap wiring (`js/main.js`) + first playable round

**Files:**
- Create: `js/main.js` (replaces the Task 1 stub)

**Interfaces:**
- Consumes: `game.js` (`loadSettings`, `saveSettings`, `createGame`, `newBoard`), `ui.js` (`createUI`)
- Produces: a working page — every header control live (difficulty, mode, Daily, custom form, sound, theme, smiley)

**Wiring rules:** header controls mutate the settings object → persist → `newBoard`. The `gameObj.settings` snapshot is always the *current* settings object passed to `newBoard`. `g.onTick = () => ui.refresh()` is assigned once and preserved across `newBoard`.

- [ ] **Step 1: Replace `js/main.js`**

```js
// Bootstrap: load settings, create the game, wire header controls to it.
import { loadSettings, saveSettings, createGame, newBoard } from './game.js';
import { createUI } from './ui.js';

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
const g = createGame(settings);
const ui = createUI(g);
g.onTick = () => ui.refresh();

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  $('theme').setAttribute('aria-pressed', String(settings.theme === 'dark'));
}
function applySound() {
  const on = settings.sound;
  $('sound').setAttribute('aria-pressed', String(on));
  $('sound').textContent = on ? '🔊' : '🔇';
}
function newGame(daily = false) {
  newBoard(g, settings, { daily });
  ui.resetCursor();
  ui.refresh();
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}

$('difficulty').value = settings.difficulty;
$('mode').value = settings.mode;
$('custom').classList.toggle('hidden', settings.difficulty !== 'custom');
if (settings.custom) {
  $('c-rows').value = settings.custom.rows;
  $('c-cols').value = settings.custom.cols;
  $('c-mines').value = settings.custom.mines;
}
applyTheme();
applySound();

$('smiley').addEventListener('click', () => newGame(false));

$('difficulty').addEventListener('change', (e) => {
  settings.difficulty = e.target.value;
  $('custom').classList.toggle('hidden', settings.difficulty !== 'custom');
  saveSettings(settings);
  newGame(false);
});

$('mode').addEventListener('change', (e) => {
  settings.mode = e.target.value;
  saveSettings(settings);
  newGame(false);
});

$('daily').addEventListener('click', () => newGame(true));

$('custom').addEventListener('submit', (e) => {
  e.preventDefault();
  settings.custom = {
    rows: clampInt($('c-rows').value, 5, 30),
    cols: clampInt($('c-cols').value, 5, 30),
    mines: clampInt($('c-mines').value, 1, 900),   // logic.clampMines narrows further
  };
  settings.difficulty = 'custom';
  saveSettings(settings);
  newGame(false);
});

$('sound').addEventListener('click', () => {
  settings.sound = !settings.sound;
  saveSettings(settings);
  applySound();
});

$('theme').addEventListener('click', () => {
  settings.theme = settings.theme === 'dark' ? 'classic' : 'dark';
  saveSettings(settings);
  applyTheme();
});

ui.refresh();
```

- [ ] **Step 2: Open the page and play a full Beginner round**

Open `index.html` in a browser (double-click works — ES modules from `file://` are fine in Chrome/Edge/Firefox for relative imports).

Manual checklist — every line must pass:

1. Board shows 9×9 raised grey cells; HUD reads `010` / `000`; smiley 🙂.
2. Click any cell → it opens (never a mine), zero-cells flood, numbered cells show colored digits. Timer starts ticking at 1 s.
3. Right-click a hidden cell → 🚩, counter reads `009`; right-click again → `?`; again → cleared, counter `010`.
4. Long-press (≥ 0.4 s) a hidden cell with the left button → flags it (touch-equivalent path).
5. On a revealed `1` whose single neighbor you flagged, left-click the `1` → neighbor reveals (chord).
6. Click a mine → 💣 appears, red flash on it, every other mine visible, face 😵, timer stops.
7. Click 🙂 → fresh 9×9, counters reset.
8. Switch difficulty to Expert → 16×30 board; scroll on a narrow window.
9. Mode = No-guess, click the board → plays normally (board is pre-validated, status line may note best-effort only if retries exhausted).
10. Click 🔊/🔇 then toggle again, toggle 🌗 theme, reload the page — all three persist (localStorage).
11. Play to a win (easy on Beginner: flood-fill reveals most of the board; finish any remaining safe cells) → face 😎, all mines show 🚩, status line shows your time and 3BV; win again → "Best" updates only if faster.

If any line fails: fix the responsible module (logic → `js/logic.js`, rules/timer/persistence → `js/game.js`, rendering/input/sound → `js/ui.js`, wiring → `js/main.js`), re-run `node --test test/logic.test.mjs`, and re-check that line.

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "feat: header controls, daily, custom sizes, theme and sound wiring"
```

---

### Task 11: Spec-conformance QA sweep

**Files:**
- Modify: whichever module a failure points at (usually `js/ui.js` or `js/game.js`)
- Test: `test/logic.test.mjs`

Work spec §9's acceptance criteria as a checklist. For each, write a node test if it's a `logic.js` behavior, otherwise verify manually in the browser.

- [ ] **Step 1: Node-testable spec items (add tests, then implement any gaps)**

Append to `test/logic.test.mjs` (import `reveal` is already present):

```js
test('spec §9: first click is never a mine (1000 seeds, all cells on a 9x9)', () => {
  for (let seed = 0; seed < 1000; seed++) {
    for (let i = 0; i < 81; i += 7) {              // sample 12 cells per seed
      const { grid } = generate({ rows: 9, cols: 9, mines: 10, mode: 'noguess', seed, safeIndex: i });
      assert.equal(grid.cells[i].mine, false);
    }
  }
});

test('spec §4.4: chord with question-mark neighbors ignores the ? cells', () => {
  const g = createGrid(3, 3);
  g.cells[4].revealed = true;
  g.cells[4].adjacent = 2;
  g.cells[0].mine = true;
  g.cells[2].mine = true;
  g.cells[0].marker = 'flag';
  g.cells[2].marker = 'flag';
  g.cells[1].marker = 'q';
  g.cells[3].marker = 'q';
  assert.deepEqual(chordTargets(g, 4), [5, 7, 8]);   // only the truly-unmarked hidden cells
});

test('spec §4.4: revealed number with wrong flag count is not chordable', () => {
  const g = createGrid(1, 3);
  g.cells[1].revealed = true;
  g.cells[1].adjacent = 2;
  g.cells[0].mine = true;
  g.cells[0].marker = 'flag';
  assert.deepEqual(chordTargets(g, 1), []);
});
```

Run: `node --test test/logic.test.mjs`
Expected: all PASS (35 tests). If the chord test fails, `chordTargets` must count only `marker === 'flag'` neighbors — fix in `js/logic.js`.

- [ ] **Step 2: Manual spec matrix (browser)**

| # | Check | Expected |
|---|-------|----------|
| 1 | Beginner/Intermediate/Expert board sizes | 9×9/10, 16×16/40, 16×30/99 |
| 2 | Custom 5×5 with mines = 99 | clamps to 16, playable |
| 3 | Custom 3×3 (below min) | inputs clamped to 5×5 |
| 4 | Daily on Beginner twice, same day | identical mine layout both times |
| 5 | Daily on Intermediate twice, same day | identical layout |
| 6 | Daily always no-guess | a perfect solver (the in-game one) solves it; status shows best-effort only on exhaustion |
| 7 | No-guess mode on Expert, 5 fresh boards | all solvable without guessing (or best-effort note shown) |
| 8 | Timer stops at 999 | leave a game open > 999 s (or devtools-eval `g.time = 998`) — never exceeds |
| 9 | Flag 11 mines on Beginner | counter shows `-01` |
| 10 | Keyboard: arrows move a visible cursor; Space reveals; F flags; Q question-marks | works, and does not fire while typing in the custom form |
| 11 | Touch: tap reveals; long-press ≥ 400 ms flags; no browser context menu | both work in DevTools touch emulation |
| 12 | Win → 😎 + all mines flagged + 3BV shown | and best time recorded for that difficulty |
| 13 | Lose → 😵 + all mines revealed, exploded mine red | timer stopped |
| 14 | Theme toggle → dark palette, persists across reload | all colors from the `--*` tokens |
| 15 | Sound toggle → click/flag/boom/win sounds synthesized, no audio files in repo | `git ls-files` shows no `.mp3/.wav/.ogg` |
| 16 | No network activity while playing (DevTools Network) | zero requests after page load |
| 17 | All 32+ logic tests green | `node --test test/logic.test.mjs` |

- [ ] **Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: spec-conformance gaps from QA sweep"
```

(If nothing needed fixing, skip the commit and note that in the QA record.)

---

### Task 12: README + GitHub Pages + final verification

**Files:**
- Create: `README.md`
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write `README.md`**

```markdown
# Minesweeper

Classic Minesweeper in your browser — Windows-95 look, no-guess boards,
a daily challenge, chording, custom sizes, 3BV, dark theme, and sound.
Zero dependencies, zero build, no network calls. Open `index.html` and play.

## Play

- **Left-click** reveals · **right-click** (or long-press) flags · **flag + question** cycle
- **Chord**: left-click a revealed number with exactly that many flags around it
- **Keyboard**: arrows move, Space/Enter reveals, F flags, Q question-marks
- **Daily**: everyone gets the same board for the day (no-guess guaranteed)
- **No-guess** mode generates only boards a perfect solver can clear

## Run

No build step. Any static server works:

```sh
npx serve .          # or: python -m http.server, or just open index.html
```

## Test

```sh
node --test test/logic.test.mjs
```

## Deploy

Push to GitHub → Settings → Pages → deploy from branch `main`, root `/`.
Or run the included workflow: `.github/workflows/deploy.yml`.
```

- [ ] **Step 2: Add `.github/workflows/deploy.yml`** (only if the user wants Pages; skip with a note if not)

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/deploy-pages@v4
        id: deployment
        with:
          path: .
```

- [ ] **Step 3: Final full verification**

1. `node --test test/logic.test.mjs` → all PASS
2. `node -e "import('./js/game.js').then(() => import('./js/ui.js').then(() => console.log('module graph OK')))"`
3. Browser: play one Beginner win, one Beginner loss, one Daily, one No-guess Expert — all per Task 10/11 checklists
4. `git ls-files` → no build tooling, no audio files, no node_modules

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/deploy.yml
git commit -m "docs: README and GitHub Pages workflow"
```

---

## Self-review notes (filled in at end of each task)

- Spec coverage: §3 boards → T2/T8; §4.1 first click → T3; §4.2 reveal/chord/marker → T4/T5/T8; §4.3 daily → T7/T8/T10; §4.4 input → T9/T10; §5 no-guess → T7; §6 3BV → T6; §7 UI/mobile/theme/sound → T1/T9/T10; §8 test → T1–T7; §9 acceptance → T11.
- Type consistency: `gameObj` shape fixed in Task 8 and used unchanged in Tasks 9–10; `settings` shape fixed in Task 8; `logic.js` exports fixed in Tasks 1–7 and never renamed.
- Known intentional deviations: solver uses the two general inferences (subsumes spec rule 3, Task 7 note); emoji faces/mines instead of hand-drawn sprites (within §7.1 "classic feel" scope).
