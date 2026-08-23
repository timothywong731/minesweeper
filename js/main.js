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
