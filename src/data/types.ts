/** A board someone has started. One per puzzle, shared by both players. */
export interface SavedBoard {
  puzzleId: string;
  n: number;
  /** Set for random puzzles so the puzzle can be rebuilt. */
  seed?: number;
  /** encodeCells() output. */
  cells: string;
  /** Active play time so far. */
  seconds: number;
  solved: boolean;
  updatedAt: number;
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

export interface Snapshot {
  boards: SavedBoard[];
  solved: SolvedRecord[];
}

/**
 * Where progress lives. Phase 2 stores it on the device; Phase 3 adds a
 * Supabase version with the same shape, and the device copy becomes a cache.
 */
export interface ProgressStore {
  load(): Promise<Snapshot>;
  saveBoard(b: SavedBoard): Promise<void>;
  deleteBoard(puzzleId: string): Promise<void>;
  saveSolved(r: SolvedRecord): Promise<void>;
}
