# Cellmates

Nonograms for two. A private app for Joel and YSL.

> Status: **Phase 1 (single-player core)**. Progress is not saved yet; that arrives in Phase 2.
> Accounts and live co-op come in Phases 3 and 4. The full setup guide lands in Phase 5.

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
| `src/puzzles` | The puzzle library. |
| `scripts` | Helper scripts (`npm run icons` redraws the app icons). |
