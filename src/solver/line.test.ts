import { solveLine } from './line';
import { runs } from './clues';
import { mulberry32 } from './rng';
import type { SolverCell } from './types';

const U = -1 as const;

describe('solveLine', () => {
  it('finds the overlap of a single block', () => {
    expect(solveLine([3], [U, U, U, U, U])).toEqual([U, U, 1, U, U]);
  });

  it('fills a block that spans the whole line', () => {
    expect(solveLine([5], [U, U, U, U, U])).toEqual([1, 1, 1, 1, 1]);
  });

  it('empties a line with no clue', () => {
    expect(solveLine([], [U, U, U])).toEqual([0, 0, 0]);
  });

  it('solves a tight fit with gaps', () => {
    expect(solveLine([1, 1], [U, U, U])).toEqual([1, 0, 1]);
    expect(solveLine([2, 1], [U, U, U, U])).toEqual([1, 1, 0, 1]);
  });

  it('uses known cells to push blocks', () => {
    // A filled cell at the start pins the 2-block there.
    expect(solveLine([2], [1, U, U, U, U])).toEqual([1, 1, 0, 0, 0]);
  });

  it('returns null when the clue cannot fit', () => {
    expect(solveLine([6], [U, U, U, U, U])).toBeNull();
    expect(solveLine([3], [1, 0, 1, U, U])).toBeNull();
    expect(solveLine([], [U, 1, U])).toBeNull();
    expect(solveLine([1, 1], [1, 1, U])).toBeNull();
  });

  it('never changes cells that are already known', () => {
    const line: SolverCell[] = [0, U, U, U, 1, U];
    const out = solveLine([2], line)!;
    expect(out[0]).toBe(0);
    expect(out[4]).toBe(1);
  });

  // Exhaustive cross-check against brute force on many random lines.
  it('agrees with brute force on random lines', () => {
    const rand = mulberry32(42);
    for (let t = 0; t < 3000; t++) {
      const n = 1 + Math.floor(rand() * 9);
      const truth = Array.from({ length: n }, () => (rand() < 0.55 ? 1 : 0));
      // Usually use the true clue (consistent), sometimes a random wrong one.
      const clue = rand() < 0.8 ? runs(truth) : runs(Array.from({ length: n }, () => (rand() < 0.5 ? 1 : 0)));
      const line: SolverCell[] = truth.map((v) => (rand() < 0.3 ? (v as SolverCell) : U));
      expect(solveLine(clue, line)).toEqual(bruteForce(clue, line));
    }
  });
});

function bruteForce(clue: number[], line: SolverCell[]): SolverCell[] | null {
  const n = line.length;
  const matches: number[][] = [];
  for (let m = 0; m < 1 << n; m++) {
    const cand = Array.from({ length: n }, (_, i) => (m >> i) & 1);
    if (cand.some((v, i) => line[i] !== -1 && line[i] !== v)) continue;
    const r = runs(cand);
    if (r.length === clue.length && r.every((v, i) => v === clue[i])) matches.push(cand);
  }
  if (!matches.length) return null;
  return line.map((_, i) => {
    const all1 = matches.every((c) => c[i] === 1);
    const all0 = matches.every((c) => c[i] === 0);
    return (all1 ? 1 : all0 ? 0 : -1) as SolverCell;
  });
}
