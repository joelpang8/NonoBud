import { puzzleFromSolution, type Puzzle } from '../game';
import { parseRows } from '../solver';
import type { LibraryEntry } from './art';
import entries from './library.json';

export const SIZES = [5, 10, 15, 20] as const;
export type Size = (typeof SIZES)[number];

/** Built from /art by `npm run art`. Every entry is checked to be fair when it is generated. */
export const LIBRARY: Puzzle[] = (entries as LibraryEntry[]).map((e) => {
  const { n, solution } = parseRows(e.rows);
  return puzzleFromSolution(e.id, e.name, n, solution, undefined, e.passes);
});

export function findPuzzle(id: string): Puzzle | undefined {
  return LIBRARY.find((p) => p.id === id);
}
