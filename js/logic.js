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
