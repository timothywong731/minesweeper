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
