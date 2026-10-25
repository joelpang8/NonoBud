import type { Clue, Clues } from './types';

/** Run lengths of filled cells in a line. Any value other than 1 counts as not filled. */
export function runs(line: ArrayLike<number>): Clue {
  const out: number[] = [];
  let c = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === 1) c++;
    else if (c) {
      out.push(c);
      c = 0;
    }
  }
  if (c) out.push(c);
  return out;
}

export function row<T>(grid: ArrayLike<T>, n: number, y: number): T[] {
  const out: T[] = [];
  for (let x = 0; x < n; x++) out.push(grid[y * n + x]);
  return out;
}

export function col<T>(grid: ArrayLike<T>, n: number, x: number): T[] {
  const out: T[] = [];
  for (let y = 0; y < n; y++) out.push(grid[y * n + x]);
  return out;
}

/** Build row and column clues from a solution grid (1 = filled). */
export function cluesFor(solution: ArrayLike<number>, n: number): Clues {
  const rows: Clue[] = [];
  const cols: Clue[] = [];
  for (let y = 0; y < n; y++) rows.push(runs(row(solution, n, y)));
  for (let x = 0; x < n; x++) cols.push(runs(col(solution, n, x)));
  return { rows, cols };
}

export function sameClue(a: Clue, b: Clue): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Does a line of cells (1 = filled) exactly match its clue? */
export function lineSatisfies(clue: Clue, line: ArrayLike<number>): boolean {
  return sameClue(runs(line), clue);
}

/** Parse the prototype's text format: '#' filled, anything else empty. */
export function parseRows(rows: string[]): { n: number; solution: number[] } {
  const n = rows.length;
  const solution: number[] = [];
  for (const r of rows) {
    if (r.length !== n) throw new Error(`Row "${r}" has ${r.length} cells, expected ${n}`);
    for (const ch of r) solution.push(ch === '#' ? 1 : 0);
  }
  return { n, solution };
}
