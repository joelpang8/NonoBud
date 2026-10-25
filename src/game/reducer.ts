import { applyChanges, emptyBoard, isSolved } from './board';
import type { Cell, Change, Puzzle, Stroke } from './types';

export interface GameState {
  puzzle: Puzzle;
  cells: Cell[];
  /** Strokes made on this device, newest last. Undo only ever reverses these. */
  undo: Stroke[];
  solved: boolean;
}

export type GameAction =
  /** A stroke made on this device (tap, drag, hint, start over): apply it and remember it for undo. */
  | { type: 'local'; stroke: Stroke }
  /** The changes that undo the newest stroke (see undoChanges): apply them and forget that stroke. */
  | { type: 'undo'; changes: Change[] }
  /** Changes from the partner or another device: apply them, nothing to undo. */
  | { type: 'remote'; changes: Change[] };

const UNDO_LIMIT = 200;

export function initGame(puzzle: Puzzle, cells?: Cell[]): GameState {
  const c = cells ?? emptyBoard(puzzle.n);
  return { puzzle, cells: c, undo: [], solved: isSolved(puzzle, c) };
}

function apply(state: GameState, changes: readonly Change[]): GameState {
  if (!changes.length) return state;
  const cells = applyChanges(state.cells, changes);
  return { ...state, cells, solved: isSolved(state.puzzle, cells) };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'local': {
      if (state.solved || !action.stroke.changes.length) return state;
      const next = apply(state, action.stroke.changes);
      return { ...next, undo: [...state.undo, action.stroke].slice(-UNDO_LIMIT) };
    }
    case 'undo': {
      if (state.solved || !state.undo.length) return state;
      return { ...apply(state, action.changes), undo: state.undo.slice(0, -1) };
    }
    case 'remote':
      return apply(state, action.changes);
  }
}
