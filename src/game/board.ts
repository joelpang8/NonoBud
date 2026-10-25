import { col, lineSatisfies, row } from '../solver';
import type { Cell, CellState, Change, Player, Puzzle, Stroke, Tool } from './types';

export const EMPTY: Cell = { s: 0, by: null };

export function emptyBoard(n: number): Cell[] {
  return Array.from({ length: n * n }, () => EMPTY);
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.s === b.s && a.by === b.by;
}

/** Filled-ness as numbers (1 filled, 0 otherwise), for clue checks. X counts as empty. */
function filled(cells: readonly Cell[]): number[] {
  return cells.map((c) => (c.s === 1 ? 1 : 0));
}

/** Which row and column clues are currently satisfied. Drives the dimmed clue style. */
export function satisfiedLines(puzzle: Puzzle, cells: readonly Cell[]): { rows: boolean[]; cols: boolean[] } {
  const f = filled(cells);
  const { n } = puzzle;
  return {
    rows: puzzle.rows.map((clue, y) => lineSatisfies(clue, row(f, n, y))),
    cols: puzzle.cols.map((clue, x) => lineSatisfies(clue, col(f, n, x))),
  };
}

/**
 * Solved when every row and column matches its clue. This accepts any grid
 * that fits the clues rather than requiring the stored picture exactly; for
 * puzzles with one answer (all of ours) the two are the same.
 */
export function isSolved(puzzle: Puzzle, cells: readonly Cell[]): boolean {
  const { rows, cols } = satisfiedLines(puzzle, cells);
  return rows.every(Boolean) && cols.every(Boolean);
}

/**
 * The rule a stroke follows, decided by the cell it starts on (same as the prototype):
 * - Fill tool on a filled cell erases filled cells; otherwise it fills anything not filled.
 * - X tool on an X clears X marks; otherwise it marks blank cells.
 */
export interface StrokeRule {
  applies: (s: CellState) => boolean;
  to: CellState;
}

export function strokeRule(tool: Tool, start: CellState): StrokeRule {
  if (tool === 'x') {
    return start === 2 ? { applies: (s) => s === 2, to: 0 } : { applies: (s) => s === 0, to: 2 };
  }
  return start === 1 ? { applies: (s) => s === 1, to: 0 } : { applies: (s) => s !== 1, to: 1 };
}

/** The change a rule makes to one cell, or null if the rule skips it. */
export function ruleChange(rule: StrokeRule, i: number, cell: Cell, by: Player): Change | null {
  if (!rule.applies(cell.s)) return null;
  const next: Cell = { s: rule.to, by: rule.to === 0 ? null : by };
  return sameCell(cell, next) ? null : { i, prev: cell, next };
}

export function applyChanges(cells: readonly Cell[], changes: readonly Change[]): Cell[] {
  const out = cells.slice();
  for (const c of changes) out[c.i] = c.next;
  return out;
}

/**
 * Changes that undo a stroke. A cell is only reverted if it still holds what
 * this stroke put there, so undoing never wipes out a partner's later move.
 */
export function undoChanges(cells: readonly Cell[], stroke: Stroke): Change[] {
  const out: Change[] = [];
  for (let k = stroke.changes.length - 1; k >= 0; k--) {
    const c = stroke.changes[k];
    if (sameCell(cells[c.i], c.next)) out.push({ i: c.i, prev: c.next, next: c.prev });
  }
  return out;
}

/** Filled cells that should be blank, and X marks on cells that should be filled. */
export function mistakes(puzzle: Puzzle, cells: readonly Cell[]): number[] {
  const out: number[] = [];
  cells.forEach((c, i) => {
    if ((c.s === 1 && puzzle.solution[i] !== 1) || (c.s === 2 && puzzle.solution[i] === 1)) out.push(i);
  });
  return out;
}

/** Fill one random cell that should be filled but isn't. Null if none are left. */
export function hintChange(puzzle: Puzzle, cells: readonly Cell[], by: Player, rand = Math.random): Change | null {
  const open: number[] = [];
  cells.forEach((c, i) => {
    if (puzzle.solution[i] === 1 && c.s !== 1) open.push(i);
  });
  if (!open.length) return null;
  const i = open[Math.floor(rand() * open.length)];
  return { i, prev: cells[i], next: { s: 1, by } };
}

export function clearChanges(cells: readonly Cell[]): Change[] {
  const out: Change[] = [];
  cells.forEach((c, i) => {
    if (c.s !== 0) out.push({ i, prev: c, next: EMPTY });
  });
  return out;
}

export function countBy(cells: readonly Cell[]): [number, number] {
  let a = 0;
  let b = 0;
  for (const c of cells) {
    if (c.s !== 1) continue;
    if (c.by === 1) b++;
    else a++;
  }
  return [a, b];
}

/** Compact picture string: '0'/'1' = filled by that player, '.' = not filled. Used for thumbnails. */
export function ownerString(cells: readonly Cell[]): string {
  return cells.map((c) => (c.s === 1 ? String(c.by ?? 0) : '.')).join('');
}
