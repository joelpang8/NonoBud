import { col, row } from './clues';
import { solveLine } from './line';
import type { Clues, SolveResult, SolverCell } from './types';

const MAX_PASSES = 200;

/**
 * Repeatedly apply the line solver to every row and column until nothing changes.
 * If the result has no unknown cells, the puzzle has exactly one solution and a
 * person can reach it without guessing.
 */
export function solveGrid({ rows, cols }: Clues, n: number): SolveResult {
  const g: SolverCell[] = new Array(n * n).fill(-1);
  let passes = 0;
  let changed = true;
  while (changed && passes < MAX_PASSES) {
    changed = false;
    passes++;
    for (let y = 0; y < n; y++) {
      const line = row(g, n, y);
      const r = solveLine(rows[y], line);
      if (!r) return { solved: false, passes, grid: null };
      for (let x = 0; x < n; x++) {
        if (r[x] !== line[x]) {
          g[y * n + x] = r[x];
          changed = true;
        }
      }
    }
    for (let x = 0; x < n; x++) {
      const line = col(g, n, x);
      const r = solveLine(cols[x], line);
      if (!r) return { solved: false, passes, grid: null };
      for (let y = 0; y < n; y++) {
        if (r[y] !== line[y]) {
          g[y * n + x] = r[y];
          changed = true;
        }
      }
    }
  }
  // The last sweep only confirms nothing changed, so it is not counted.
  return { solved: g.every((v) => v !== -1), passes: Math.max(1, passes - 1), grid: g };
}

export type Difficulty = 'Gentle' | 'Medium' | 'Tricky' | 'Needs a guess';

/** Same formula as the prototype: solver sweeps plus a bump for bigger boards. */
export function difficulty(result: Pick<SolveResult, 'solved' | 'passes'>, n: number): Difficulty {
  if (!result.solved) return 'Needs a guess';
  const s = result.passes + n / 5;
  return s < 6 ? 'Gentle' : s < 10 ? 'Medium' : 'Tricky';
}
