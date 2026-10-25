import type { Cell, CellState, Player } from '../game';

/** Summary of a started board: enough for the level list without loading every cell. */
export interface BoardMeta {
  puzzleId: string;
  n: number;
  /** Set for random puzzles so the puzzle can be rebuilt. */
  seed?: number;
  /** Goes up on "Play again"; moves from an older round are ignored. */
  round: number;
  /** Active play time, the larger of both players' clocks. */
  seconds: number;
  solved: boolean;
  updatedAt: number;
}

/** A full board: every cell plus the clock value of the last move to each cell. */
export interface BoardDoc extends BoardMeta {
  cells: Cell[];
  vers: number[];
}

/** How a board is kept in the device cache. */
export interface CachedBoard extends BoardMeta {
  /** encodeCells() output. */
  cells: string;
  vers: number[];
}

/** A finished puzzle, shown in the level list and the gallery. */
export interface SolvedRecord {
  puzzleId: string;
  name: string;
  n: number;
  seconds: number;
  /** ownerString(): '0'/'1' per filled cell, '.' for blank. */
  owners: string;
  together: boolean;
  seed?: number;
  solvedAt: number;
}

/** One cell's new value, stamped with a clock value for last-write-wins. */
export interface CellMove {
  i: number;
  s: CellState;
  /** Whose color a filled cell shows (null for blank). */
  o: Player | null;
  v: number;
}

/** Work waiting to be sent to the server, kept in order in the outbox. */
export type Op =
  | { kind: 'moves'; puzzleId: string; n: number; seed?: number; round: number; seconds: number; moves: CellMove[] }
  | { kind: 'solve'; puzzleId: string; round: number; record: SolvedRecord }
  | { kind: 'reset'; puzzleId: string; fromRound: number };

export interface RemoteCell {
  idx: number;
  state: CellState;
  owner: Player | null;
  ver: number;
}

/** The server side. Supabase in the app; an in-memory fake in tests. */
export interface Remote {
  listBoards(): Promise<BoardMeta[]>;
  listSolves(): Promise<SolvedRecord[]>;
  getBoard(puzzleId: string): Promise<{ meta: BoardMeta | null; cells: RemoteCell[] }>;
  /** Returns the board's current round; if it isn't op.round, the moves were ignored. */
  applyMoves(op: Extract<Op, { kind: 'moves' }>): Promise<number>;
  recordSolve(op: Extract<Op, { kind: 'solve' }>): Promise<void>;
  /** Returns the round after the reset. */
  resetBoard(op: Extract<Op, { kind: 'reset' }>): Promise<number>;
}

/** Thrown by a Remote when the device can't reach the server (as opposed to the server refusing). */
export class OfflineError extends Error {
  constructor(message = 'offline') {
    super(message);
    this.name = 'OfflineError';
  }
}

export type SyncStatus =
  /** No server configured: progress stays on this device. */
  | 'local'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';
