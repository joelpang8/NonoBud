import { applyChanges, clearChanges, emptyBoard, hintChange, isSolved, undoChanges } from './board';
import type { Cell, Change, Player, Puzzle, Stroke } from './types';

export interface GameState {
  puzzle: Puzzle;
  cells: Cell[];
  /** Strokes by this device's player, newest last. */
  undo: Stroke[];
  solved: boolean;
}

export type GameAction =
  | { type: 'stroke'; stroke: Stroke }
  | { type: 'undo'; by: Player }
  | { type: 'hint'; by: Player; rand?: () => number }
  | { type: 'clear'; by: Player }
  | { type: 'load'; puzzle: Puzzle; cells?: Cell[] };

const UNDO_LIMIT = 200;

export function initGame(puzzle: Puzzle, cells?: Cell[]): GameState {
  const c = cells ?? emptyBoard(puzzle.n);
  return { puzzle, cells: c, undo: [], solved: isSolved(puzzle, c) };
}

function commit(state: GameState, changes: Change[], by: Player, recordUndo: boolean): GameState {
  if (!changes.length || state.solved) return state;
  const cells = applyChanges(state.cells, changes);
  const undo = recordUndo ? [...state.undo, { by, changes }].slice(-UNDO_LIMIT) : state.undo;
  return { ...state, cells, undo, solved: isSolved(state.puzzle, cells) };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'load':
      return initGame(action.puzzle, action.cells);
    case 'stroke':
      return commit(state, action.stroke.changes, action.stroke.by, true);
    case 'hint': {
      const c = hintChange(state.puzzle, state.cells, action.by, action.rand);
      return c ? commit(state, [c], action.by, true) : state;
    }
    case 'clear':
      return commit(state, clearChanges(state.cells), action.by, true);
    case 'undo': {
      if (state.solved) return state;
      const last = state.undo[state.undo.length - 1];
      if (!last) return state;
      const rest = state.undo.slice(0, -1);
      const changes = undoChanges(state.cells, last);
      const next = commit(state, changes, action.by, false);
      return { ...next, undo: rest };
    }
  }
}
