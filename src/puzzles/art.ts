import { cluesFor, findSolutions, solveGrid } from '../solver';

export const PUZZLE_SIZES = [5, 10, 15, 20] as const;

/** One library entry as stored in library.json. */
export interface LibraryEntry {
  id: string;
  name: string;
  n: number;
  /** Picture rows, '#' = filled, '.' = blank. Easy to read in a code review. */
  rows: string[];
  /** Solver sweeps needed (precomputed so the app doesn't solve every puzzle on startup). */
  passes: number;
}

/**
 * Read a picture into a solution grid. Dark, mostly opaque pixels are filled.
 *
 * The image must be square. If it is 5, 10, 15 or 20 pixels wide, each pixel is
 * one cell. Larger images are treated as scaled-up pixel art: the smallest
 * puzzle size whose blocks are all one color wins (so a 10×10 drawing saved at
 * 16 pixels per cell reads as 10×10).
 */
export function imageToSolution(width: number, height: number, rgba: ArrayLike<number>): { n: number; solution: number[] } {
  if (width !== height) throw new Error(`image is ${width}×${height}; it must be square`);
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    return rgba[i + 3] >= 128 && lum < 128 ? 1 : 0;
  };
  const sample = (n: number): number[] | null => {
    const k = width / n;
    const out: number[] = [];
    for (let cy = 0; cy < n; cy++) {
      for (let cx = 0; cx < n; cx++) {
        const v = dark(cx * k, cy * k);
        for (let y = cy * k; y < (cy + 1) * k; y++) for (let x = cx * k; x < (cx + 1) * k; x++) if (dark(x, y) !== v) return null;
        out.push(v);
      }
    }
    return out;
  };
  if ((PUZZLE_SIZES as readonly number[]).includes(width)) return { n: width, solution: sample(width)! };
  for (const n of PUZZLE_SIZES) {
    if (width % n) continue;
    const s = sample(n);
    if (s) return { n, solution: s };
  }
  throw new Error(`image is ${width}px wide; use 5, 10, 15 or 20 pixels (or a clean multiple, like 16 pixels per cell)`);
}

export type Verdict =
  | { ok: true; passes: number }
  | { ok: false; reason: string };

/** Is this picture a fair puzzle: exactly one answer, reachable without guessing? */
export function checkPicture(n: number, solution: number[]): Verdict {
  if (solution.every((v) => v === 0)) return { ok: false, reason: 'the picture is blank' };
  const clues = cluesFor(solution, n);
  const res = solveGrid(clues, n);
  if (res.solved) return { ok: true, passes: res.passes };
  const answers = findSolutions(clues, n, 2).length;
  const unknown = res.grid!.flatMap((v, i) => (v === -1 ? [i] : []));
  const rows = [...new Set(unknown.map((i) => Math.floor(i / n) + 1))];
  const where = `stuck cells are in row${rows.length > 1 ? 's' : ''} ${rows.join(', ')}`;
  return answers > 1
    ? { ok: false, reason: `it has more than one answer (${where}). Change a pixel or two there.` }
    : { ok: false, reason: `it can only be finished by guessing (${where}). Change a pixel or two there.` };
}

export function toRows(n: number, solution: number[]): string[] {
  const rows: string[] = [];
  for (let y = 0; y < n; y++) rows.push(solution.slice(y * n, y * n + n).map((v) => (v ? '#' : '.')).join(''));
  return rows;
}

/** "big-heart" -> "Big heart" */
export function nameFromFile(base: string): string {
  const words = base.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function slug(base: string): string {
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
