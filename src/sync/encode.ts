import type { Cell } from '../game';

/*
 * One character per cell, so a 20×20 board is a 400-character string:
 *   .  blank
 *   A  filled by Joel     B  filled by YSL
 *   x  X by Joel          y  X by YSL
 */
const ENC: Record<string, string> = { '1:0': 'A', '1:1': 'B', '2:0': 'x', '2:1': 'y' };
const DEC: Record<string, Cell> = {
  A: { s: 1, by: 0 },
  B: { s: 1, by: 1 },
  x: { s: 2, by: 0 },
  y: { s: 2, by: 1 },
};
const BLANK: Cell = { s: 0, by: null };

export function encodeCells(cells: readonly Cell[]): string {
  return cells.map((c) => (c.s === 0 ? '.' : ENC[`${c.s}:${c.by ?? 0}`])).join('');
}

/** Returns null if the string doesn't fit the board (e.g. corrupted or from another size). */
export function decodeCells(s: string, n: number): Cell[] | null {
  if (s.length !== n * n) return null;
  const out: Cell[] = [];
  for (const ch of s) {
    if (ch === '.') out.push(BLANK);
    else if (DEC[ch]) out.push(DEC[ch]);
    else return null;
  }
  return out;
}
