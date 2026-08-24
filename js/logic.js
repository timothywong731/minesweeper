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
  const count = Math.min(mines, pool.length);   // safe zone may cover the whole board (tiny grids)
  for (let k = 0; k < count; k++) {
    const j = k + Math.floor(rng() * (pool.length - k));
    [pool[k], pool[j]] = [pool[j], pool[k]];
  }
  for (const i of pool.slice(0, count)) grid.cells[i].mine = true;
  for (let i = 0; i < n; i++) {
    if (!grid.cells[i].mine) {
      grid.cells[i].adjacent = neighbors(grid, i).filter((j) => grid.cells[j].mine).length;
    }
  }
  return grid;
}

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

export function isWin(grid) {
  return grid.cells.every((c) => c.mine || c.revealed);
}

export function cloneGrid(grid) {
  return { rows: grid.rows, cols: grid.cols, cells: grid.cells.map((c) => ({ ...c })) };
}

// 3BV (spec §4.3): minimum clicks to open all safe cells — one per
// connected zero-region (that click also opens the region's numbered
// border) plus one per numbered cell that borders no zero region.
// Order-independent: computed directly, not by simulating clicks.
export function threeBV(grid) {
  const n = grid.cells.length;
  const inRegion = new Array(n).fill(false);
  let clicks = 0;
  for (let i = 0; i < n; i++) {
    const c = grid.cells[i];
    if (c.mine || c.revealed) continue;
    if (c.adjacent === 0) {
      if (inRegion[i]) continue;
      clicks++;
      const stack = [i];
      inRegion[i] = true;
      while (stack.length) {
        const j = stack.pop();
        for (const k of neighbors(grid, j)) {
          const ck = grid.cells[k];
          if (!inRegion[k] && !ck.mine && !ck.revealed && ck.adjacent === 0) {
            inRegion[k] = true;
            stack.push(k);
          }
        }
      }
    } else {
      const bordersZero = neighbors(grid, i).some((j) => {
        const cj = grid.cells[j];
        return !cj.mine && !cj.revealed && cj.adjacent === 0;
      });
      if (!bordersZero) clicks++;
    }
  }
  return clicks;
}

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
