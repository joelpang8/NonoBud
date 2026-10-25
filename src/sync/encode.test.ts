import { emptyBoard, type Cell } from '../game';
import { decodeCells, encodeCells } from './encode';

describe('cell encoding', () => {
  it('round-trips every cell kind', () => {
    const cells: Cell[] = [
      { s: 0, by: null },
      { s: 1, by: 0 },
      { s: 1, by: 1 },
      { s: 2, by: 0 },
      { s: 2, by: 1 },
      ...emptyBoard(2).slice(0, 4),
    ];
    const s = encodeCells(cells);
    expect(s).toBe('.ABxy....');
    expect(decodeCells(s, 3)).toEqual(cells);
  });

  it('rejects strings that do not fit', () => {
    expect(decodeCells('...', 2)).toBeNull();
    expect(decodeCells('..Q.', 2)).toBeNull();
  });
});
