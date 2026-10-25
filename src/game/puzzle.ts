import { cluesFor, generate, parseRows, solveGrid, type Generated } from '../solver';
import type { Puzzle } from './types';

export function puzzleFromSolution(id: string, name: string, n: number, solution: number[], seed?: number): Puzzle {
  const clues = cluesFor(solution, n);
  const res = solveGrid(clues, n);
  return { id, name, n, solution, ...clues, passes: res.passes, lineSolvable: res.solved, seed };
}

export function puzzleFromRows(id: string, name: string, rows: string[]): Puzzle {
  const { n, solution } = parseRows(rows);
  return puzzleFromSolution(id, name, n, solution);
}

export function randomPuzzleId(n: number, seed: number): string {
  return `r${n}-${seed}`;
}

export function puzzleFromGenerated(g: Generated): Puzzle {
  return {
    id: randomPuzzleId(g.n, g.seed),
    name: `Random ${g.n}×${g.n}`,
    n: g.n,
    rows: g.rows,
    cols: g.cols,
    solution: g.solution,
    passes: g.passes,
    lineSolvable: true,
    seed: g.seed,
  };
}

/** Make a new random puzzle. Keeps trying fresh seeds until one is fair (practically instant). */
export function newRandomPuzzle(n: number, seed: () => number): Puzzle {
  for (;;) {
    const g = generate(n, seed());
    if (g) return puzzleFromGenerated(g);
  }
}
