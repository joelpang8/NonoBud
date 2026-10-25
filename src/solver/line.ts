import type { Clue, SolverCell } from './types';

/**
 * Find every cell in a single line that is forced by its clue.
 *
 * Works by dynamic programming over (position, clue index): a forward pass
 * marks which states are reachable from the start, a backward pass marks which
 * states can still reach a valid end. A cell is forced filled if every valid
 * placement fills it, forced empty if every valid placement leaves it empty.
 *
 * Returns the refined line, or null if no placement fits (a contradiction).
 * Ported from the prototype without changing its logic.
 */
export function solveLine(clue: Clue, line: readonly SolverCell[]): SolverCell[] | null {
  const n = line.length;
  const k = clue.length;

  // Prefix counts let us ask "any filled / any empty in [a, b)?" in O(1).
  const ones = new Array<number>(n + 1).fill(0);
  const zeros = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    ones[i + 1] = ones[i] + (line[i] === 1 ? 1 : 0);
    zeros[i + 1] = zeros[i] + (line[i] === 0 ? 1 : 0);
  }

  // canPlaceBlock: clue[ci] can start at pos (no empties inside, not followed by a filled cell).
  const canPlaceBlock = (pos: number, ci: number): boolean => {
    const len = clue[ci];
    return pos + len <= n && zeros[pos + len] - zeros[pos] === 0 && (pos + len === n || line[pos + len] !== 1);
  };

  // S[pos][ci]: can clues ci..k-1 be placed validly in cells pos..n-1?
  const S: boolean[][] = [];
  for (let pos = 0; pos <= n; pos++) S.push(new Array<boolean>(k + 1).fill(false));
  for (let pos = n; pos >= 0; pos--) {
    for (let ci = k; ci >= 0; ci--) {
      if (ci === k) {
        S[pos][ci] = ones[n] - ones[pos] === 0;
        continue;
      }
      let ok = false;
      if (pos < n) {
        if (line[pos] !== 1 && S[pos + 1][ci]) ok = true;
        if (!ok && canPlaceBlock(pos, ci) && S[Math.min(n, pos + clue[ci] + 1)][ci + 1]) ok = true;
      }
      S[pos][ci] = ok;
    }
  }
  if (!S[0][0]) return null;

  // Forward pass: P[pos][ci] reachable from the start. Record what each valid path does to each cell.
  const P: boolean[][] = [];
  for (let pos = 0; pos <= n; pos++) P.push(new Array<boolean>(k + 1).fill(false));
  P[0][0] = true;
  const canFill = new Array<boolean>(n).fill(false);
  const canEmpty = new Array<boolean>(n).fill(false);
  for (let pos = 0; pos < n; pos++) {
    for (let ci = 0; ci <= k; ci++) {
      if (!P[pos][ci]) continue;
      if (line[pos] !== 1) {
        P[pos + 1][ci] = true;
        if (S[pos + 1][ci]) canEmpty[pos] = true;
      }
      if (ci < k && canPlaceBlock(pos, ci)) {
        const len = clue[ci];
        const next = Math.min(n, pos + len + 1);
        P[next][ci + 1] = true;
        if (S[next][ci + 1]) {
          for (let j = pos; j < pos + len; j++) canFill[j] = true;
          if (pos + len < n) canEmpty[pos + len] = true;
        }
      }
    }
  }

  const out: SolverCell[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (line[i] !== -1) out[i] = line[i];
    else if (canFill[i] && !canEmpty[i]) out[i] = 1;
    else if (canEmpty[i] && !canFill[i]) out[i] = 0;
    else out[i] = -1;
  }
  return out;
}
