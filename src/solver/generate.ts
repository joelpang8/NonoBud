import { cluesFor } from './clues';
import { solveGrid } from './grid';
import { mulberry32 } from './rng';
import type { Clues } from './types';

export interface Generated extends Clues {
  n: number;
  /** The seed actually used. Regenerating with { seed, attempts: 1 } reproduces this exact puzzle. */
  seed: number;
  solution: number[];
  passes: number;
}

/**
 * Make one random candidate from a seed. Deterministic: the same (n, seed) always
 * produces the same grid, which is how a random puzzle can be shared by its seed.
 */
export function candidate(n: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const density = 0.5 + rand() * 0.15;
  const sol: number[] = [];
  for (let i = 0; i < n * n; i++) sol.push(rand() < density ? 1 : 0);
  return sol;
}

/**
 * Generate a random puzzle that line logic alone can solve (so it has exactly
 * one solution and never needs a guess). Tries seed, seed+1, … up to `attempts`
 * candidates. Returns null if none qualify, which the caller should handle by
 * trying again with a new seed.
 *
 * Differs from the prototype on purpose: the prototype could return an
 * unsolvable puzzle when it ran out of time. This never does.
 */
export function generate(n: number, seed: number, attempts = 400): Generated | null {
  for (let a = 0; a < attempts; a++) {
    const s = (seed + a) >>> 0;
    const solution = candidate(n, s);
    const clues = cluesFor(solution, n);
    if (clues.rows.some((r) => !r.length) || clues.cols.some((c) => !c.length)) continue;
    const res = solveGrid(clues, n);
    if (res.solved) return { n, seed: s, solution, passes: res.passes, ...clues };
  }
  return null;
}
