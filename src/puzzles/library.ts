import { puzzleFromRows, type Puzzle } from '../game';
import { PROTOTYPE_PUZZLES } from './prototype';

export const SIZES = [5, 10, 15, 20] as const;
export type Size = (typeof SIZES)[number];

export const LIBRARY: Puzzle[] = PROTOTYPE_PUZZLES.map((p) => puzzleFromRows(p.id, p.name, p.rows));

export function findPuzzle(id: string): Puzzle | undefined {
  return LIBRARY.find((p) => p.id === id);
}
