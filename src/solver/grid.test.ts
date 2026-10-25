import { cluesFor, lineSatisfies, parseRows, runs } from './clues';
import { difficulty, solveGrid } from './grid';
import { findSolutions } from './search';
import LIBRARY from '../puzzles/library.json';

describe('clue helpers', () => {
  it('computes runs', () => {
    expect(runs([1, 1, 0, 1, 0, 0, 1, 1, 1])).toEqual([2, 1, 3]);
    expect(runs([0, 0])).toEqual([]);
  });

  it('treats marks (2) as not filled', () => {
    expect(runs([1, 2, 1])).toEqual([1, 1]);
    expect(lineSatisfies([1, 1], [1, 2, 1])).toBe(true);
  });

  it('rejects ragged text puzzles', () => {
    expect(() => parseRows(['##', '#'])).toThrow();
  });
});

describe('solveGrid', () => {
  it.each(LIBRARY)('solves library puzzle "$name" uniquely by line logic', ({ rows }) => {
    const { n, solution } = parseRows(rows);
    const res = solveGrid(cluesFor(solution, n), n);
    expect(res.solved).toBe(true);
    expect(res.grid).toEqual(solution);
  });

  it('returns a null grid for contradictory clues', () => {
    // Rows say every cell is filled, columns say only one per column.
    const res = solveGrid({ rows: [[2], [2]], cols: [[1], [1]] }, 2);
    expect(res.solved).toBe(false);
    expect(res.grid).toBeNull();
  });

  it('returns a null grid when a clue is too long for the board', () => {
    expect(solveGrid({ rows: [[4], [], []], cols: [[1], [1], [1]] }, 3).grid).toBeNull();
  });

  it('reports puzzles with more than one solution as unsolved, not wrong', () => {
    // Two diagonals both fit these clues.
    const res = solveGrid({ rows: [[1], [1]], cols: [[1], [1]] }, 2);
    expect(res.solved).toBe(false);
    expect(res.grid).toEqual([-1, -1, -1, -1]);
  });
});

describe('findSolutions', () => {
  it('finds the single answer of a unique puzzle', () => {
    expect(findSolutions({ rows: [[2], [1]], cols: [[2], [1]] }, 2)).toEqual([[1, 1, 1, 0]]);
  });

  it('stops at the limit for puzzles with several answers', () => {
    expect(findSolutions({ rows: [[1], [1]], cols: [[1], [1]] }, 2, 5)).toHaveLength(2);
  });

  it('finds nothing for contradictory clues', () => {
    expect(findSolutions({ rows: [[2], [2]], cols: [[1], [1]] }, 2)).toEqual([]);
  });
});

describe('difficulty', () => {
  it('labels by passes plus board size', () => {
    expect(difficulty({ solved: true, passes: 2 }, 5)).toBe('Gentle');
    expect(difficulty({ solved: true, passes: 7 }, 10)).toBe('Medium');
    expect(difficulty({ solved: true, passes: 7 }, 20)).toBe('Tricky');
    expect(difficulty({ solved: false, passes: 3 }, 10)).toBe('Needs a guess');
  });
});
