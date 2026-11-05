import { puzzleFromSolution, type Puzzle } from '../game';
import { parseRows } from '../solver';
import type { LibraryEntry } from './art';
import entries from './library.json';

export const SIZES = [5, 10, 15, 20, 25, 30] as const;
export type Size = (typeof SIZES)[number];

/** Built from /art by `npm run art`. Every entry is checked to be fair when it is generated. */
export const LIBRARY: Puzzle[] = (entries as LibraryEntry[]).map((e) => {
  const { n, solution } = parseRows(e.rows);
  return puzzleFromSolution(e.id, e.name, n, solution, undefined, e.passes);
});

export function findPuzzle(id: string): Puzzle | undefined {
  return LIBRARY.find((p) => p.id === id);
}

/** A puzzle's number within its size section (#1, #2, …). Stable: new puzzles are added at the end. */
const NUMBERS = new Map<string, number>();
for (const n of SIZES) LIBRARY.filter((p) => p.n === n).forEach((p, i) => NUMBERS.set(p.id, i + 1));
export function puzzleNumber(id: string): number | undefined {
  return NUMBERS.get(id);
}
