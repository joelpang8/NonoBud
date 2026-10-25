# Cellmates

Nonograms for two. A private app for Joel and YSL.

> Status: **Phase 2 (puzzle library and progress)**. Progress is saved on each device for now.
> Accounts, shared progress and live co-op come in Phases 3 and 4. The full setup guide lands in Phase 5.

## Run it on your computer

1. Install **Node.js 22** from https://nodejs.org (choose the "LTS" download).
2. Open a terminal in this folder and run:
   ```bash
   npm install
   npm run dev
   ```
3. Open the address it prints (usually http://localhost:5173).

### Try it on your phone (same Wi-Fi)

```bash
npm run dev -- --host
```
It prints a "Network" address like `http://192.168.1.20:5173`. Open that on your phone.
(Installing to the home screen needs HTTPS, so that part is tested after deploying.)

## Add your own picture puzzles

1. Draw a small black-and-white picture in any pixel-art app
   (free options: [Piskel](https://www.piskelapp.com), [Pixilart](https://www.pixilart.com)).
   - Make it square: **5×5, 10×10, 15×15 or 20×20** pixels.
   - Black (or any dark color) = filled cell. White or transparent = blank.
   - Bigger exports are fine if every cell is the same size (e.g. 16 pixels per cell).
2. Save it as a PNG in the `art` folder. The file name becomes the puzzle name:
   `our-dog.png` becomes "Our dog".
3. In the terminal, in this folder, run:
   ```bash
   npm run art
   ```
   Each picture gets an `ok`, or a note like
   *"it has more than one answer (stuck cells are in rows 3, 4). Change a pixel or two there."*
   Every puzzle has to be solvable by logic alone, with no guessing. If a picture fails,
   change a pixel or two in the rows it names and run `npm run art` again.
4. The app picks up the new puzzles straight away.

## Checks

```bash
npm test          # unit tests (solver, game logic, routes)
npm run typecheck # TypeScript
npm run build     # production build into dist/
```

## Project layout

| Folder | What's in it |
| --- | --- |
| `src/solver` | Line solver, grid solver, seeded random generator. No React. Fully tested. |
| `src/game` | Board rules: strokes, undo, check, hint, win. No React. Fully tested. |
| `src/components`, `src/screens` | The React UI. |
| `src/puzzles` | The puzzle library (`library.json` is generated from `/art`). |
| `src/data` | Saving progress (on the device for now; Supabase in Phase 3). |
| `art` | One PNG per picture puzzle. |
| `scripts` | `npm run art` builds puzzles from `/art`; `npm run icons` redraws the app icons. |
