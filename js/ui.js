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
