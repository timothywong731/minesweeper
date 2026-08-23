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
