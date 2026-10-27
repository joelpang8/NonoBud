import { cluesFor } from './clues';
import { candidate, generate } from './generate';
import { solveGrid } from './grid';

describe('generate', () => {
  it.each([
    [5, 200],
    [10, 200],
    [15, 200],
    [20, 200],
    [25, 60],
    [30, 40],
  ])('makes fully line-solvable %ix%i puzzles', (n, count) => {
    for (let i = 0; i < count; i++) {
      const g = generate(n, i * 7919 + n);
      expect(g).not.toBeNull();
      const res = solveGrid({ rows: g!.rows, cols: g!.cols }, n);
      expect(res.solved).toBe(true);
      expect(res.grid).toEqual(g!.solution);
      expect(cluesFor(g!.solution, n)).toEqual({ rows: g!.rows, cols: g!.cols });
      expect(g!.rows.every((r) => r.length > 0) && g!.cols.every((c) => c.length > 0)).toBe(true);
    }
  });

  it('is deterministic for a seed', () => {
    expect(generate(10, 12345)).toEqual(generate(10, 12345));
    expect(candidate(15, 99)).toEqual(candidate(15, 99));
  });

  it('reproduces a puzzle from the seed it reports', () => {
    const g = generate(15, 777)!;
    expect(generate(15, g.seed, 1)).toEqual(g);
  });

  it('returns null when it runs out of attempts', () => {
    expect(generate(10, 1, 0)).toBeNull();
  });
});
