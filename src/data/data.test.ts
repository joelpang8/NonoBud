import 'fake-indexeddb/auto';
import { emptyBoard, type Cell } from '../game';
import { decodeCells, encodeCells } from './encode';
import { createLocalStore } from './local';
import type { SavedBoard } from './types';

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

describe('local store', () => {
  const board = (id: string, cells = '.'.repeat(25)): SavedBoard => ({ puzzleId: id, n: 5, cells, seconds: 12, solved: false, updatedAt: 1 });

  it('saves, loads and deletes boards and solved records', async () => {
    const name = `test-${Math.random()}`;
    const a = createLocalStore(name);
    await a.saveBoard(board('p5-heart', 'A' + '.'.repeat(24)));
    await a.saveBoard(board('r5-9', '.'.repeat(25)));
    await a.saveSolved({ puzzleId: 'p5-tree', name: 'Tree', n: 5, seconds: 40, owners: '.', together: false, solvedAt: 2 });
    await a.deleteBoard('r5-9');

    // A fresh store on the same database sees the same data, like reopening the app.
    const b = createLocalStore(name);
    const snap = await b.load();
    expect(snap.boards.map((x) => x.puzzleId)).toEqual(['p5-heart']);
    expect(snap.boards[0].cells[0]).toBe('A');
    expect(snap.solved.map((x) => x.puzzleId)).toEqual(['p5-tree']);
  });
});
