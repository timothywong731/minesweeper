import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, createGrid, neighbors, clampMines, placeMines, reveal, chordTargets, cycleMarker } from '../js/logic.js';

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

// Build a board from an ASCII map.
// '.' hidden safe · '#' hidden mine · 'F' hidden flagged · '0'-'8' numbered cell.
// digitsRevealed (default): numbered cells are revealed; pass false for
// pre-click boards where numbers are still hidden.
function board(map, digitsRevealed = true) {
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
      if (n >= 0) { cell.adjacent = n; if (digitsRevealed) cell.revealed = true; }
    }
  }
  return g;
}

const MAP_SOLVE = ['000', '011', '01#'];   // mine at (2,2); top row opened by first click

test('reveal: zero flood opens region + numbered border, never mines', () => {
  const g = board(MAP_SOLVE, false);   // pre-click: numbers still hidden
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

test('cycleMarker: none → flag → q → none', () => {
  assert.equal(cycleMarker('none'), 'flag');
  assert.equal(cycleMarker('flag'), 'q');
  assert.equal(cycleMarker('q'), 'none');
});

const MAP_CHORD2 = [
  '.2.',
  'F2F',
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
