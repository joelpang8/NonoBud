import type { Clue } from '../solver';

/** What a cell shows. 0 = blank, 1 = filled, 2 = marked with an X. */
export type CellState = 0 | 1 | 2;

/** Player slot. 0 = Joel (rose), 1 = YSL (teal). Fixed per person on every screen. */
export type Player = 0 | 1;

export interface Cell {
  s: CellState;
  /** Who last set this cell, or null if never touched / cleared by nobody in particular. */
  by: Player | null;
}

export interface Puzzle {
  id: string;
  name: string;
  n: number;
  rows: Clue[];
  cols: Clue[];
  /** 1 = filled. Used for Check and Hint. */
  solution: number[];
  /** Solver sweeps needed. Drives the difficulty label. */
  passes: number;
  /** True when line logic alone solves it (always true for the library and random puzzles). */
  lineSolvable: boolean;
  /** Present for random puzzles: regenerate with generate(n, seed, 1). */
  seed?: number;
}

/** One cell changing from one value to another. */
export interface Change {
  i: number;
  prev: Cell;
  next: Cell;
}

/** Everything one gesture did (a tap, a drag, a hint, a start-over). Undo reverses one stroke. */
export interface Stroke {
  by: Player;
  changes: Change[];
}

export type Tool = 'fill' | 'x';
