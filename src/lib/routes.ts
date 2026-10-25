import type { Route } from '../hooks/useHashRoute';

/** Where a puzzle lives: library puzzles by id, random ones by size and seed. */
export function puzzleRoute(p: { puzzleId: string; n: number; seed?: number }): Route {
  return p.seed !== undefined ? { name: 'random', n: p.n, seed: p.seed } : { name: 'puzzle', id: p.puzzleId };
}
