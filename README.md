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
