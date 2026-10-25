import { col, row } from './clues';
import { solveLine } from './line';
import type { Clues, SolverCell } from './types';

/** Line-propagate in place. Returns false on contradiction. */
function propagate(g: SolverCell[], { rows, cols }: Clues, n: number): boolean {
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < n; y++) {
      const line = row(g, n, y);
      const r = solveLine(rows[y], line);
      if (!r) return false;
      for (let x = 0; x < n; x++) if (r[x] !== line[x]) ((g[y * n + x] = r[x]), (changed = true));
    }
    for (let x = 0; x < n; x++) {
      const line = col(g, n, x);
      const r = solveLine(cols[x], line);
      if (!r) return false;
      for (let y = 0; y < n; y++) if (r[y] !== line[y]) ((g[y * n + x] = r[y]), (changed = true));
    }
  }
  return true;
}

/**
 * Count solutions (stopping at `limit`) by line propagation plus guessing.
 * Used by tests and the art script to tell "needs a guess but unique" apart
 * from "has several answers". Returns up to `limit` solutions found.
 */
export function findSolutions(clues: Clues, n: number, limit = 2): number[][] {
  const found: number[][] = [];
  const walk = (g: SolverCell[]) => {
    if (found.length >= limit || !propagate(g, clues, n)) return;
    const i = g.indexOf(-1);
    if (i < 0) {
      found.push(g.slice());
      return;
    }
    for (const v of [1, 0] as const) {
      const next = g.slice();
      next[i] = v;
      walk(next);
    }
  };
  walk(new Array<SolverCell>(n * n).fill(-1));
  return found;
}
