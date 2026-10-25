/** A cell as the solver sees it: -1 unknown, 0 empty, 1 filled. */
export type SolverCell = -1 | 0 | 1;

/** A run-length clue for one row or column. An empty array means the line is blank. */
export type Clue = number[];

export interface Clues {
  rows: Clue[];
  cols: Clue[];
}

export interface SolveResult {
  /** True when line logic alone determines every cell. */
  solved: boolean;
  /** Number of full row+column sweeps that made progress. Used for difficulty. */
  passes: number;
  /** The grid as far as line logic got, or null if the clues contradict each other. */
  grid: SolverCell[] | null;
}
