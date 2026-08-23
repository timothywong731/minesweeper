import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, createGrid, neighbors, clampMines, placeMines } from '../js/logic.js';

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
