import {
  clearChanges,
  countBy,
  emptyBoard,
  hintChange,
  gameReducer,
  initGame,
  isSolved,
  mistakes,
  ownerString,
  puzzleFromRows,
  ruleChange,
  satisfiedLines,
  strokeRule,
  undoChanges,
  type Cell,
  type Change,
  type GameState,
  type Player,
  type Tool,
} from '.';

const heart = puzzleFromRows('t-heart', 'Heart', ['.#.#.', '#####', '#####', '.###.', '..#..']);

/** Simulate a drag over cells, the way the board component builds strokes. */
function drag(state: GameState, tool: Tool, idx: number[], by: Player = 0): GameState {
  const rule = strokeRule(tool, state.cells[idx[0]].s);
  const changes: Change[] = [];
  let cells = state.cells.slice();
  for (const i of idx) {
    const c = ruleChange(rule, i, cells[i], by);
    if (c) {
      changes.push(c);
      cells[i] = c.next;
    }
  }
  return gameReducer(state, { type: 'local', stroke: { by, changes } });
}

const undo = (g: GameState): GameState => gameReducer(g, { type: 'undo', changes: undoChanges(g.cells, g.undo[g.undo.length - 1]) });
const clear = (g: GameState, by: Player = 0): GameState => gameReducer(g, { type: 'local', stroke: { by, changes: clearChanges(g.cells) } });

const solutionCells = (): number[] =>
  heart.solution.flatMap((v, i) => (v ? [i] : []));

describe('strokes', () => {
  it('fills, then erases when starting on a filled cell', () => {
    let g = initGame(heart);
    g = drag(g, 'fill', [5, 6, 7]);
    expect(g.cells.slice(5, 8).map((c) => c.s)).toEqual([1, 1, 1]);
    g = drag(g, 'fill', [6, 7]);
    expect(g.cells.slice(5, 8).map((c) => c.s)).toEqual([1, 0, 0]);
  });

  it('fill overwrites X marks, X does not overwrite fills', () => {
    let g = initGame(heart);
    g = drag(g, 'x', [0]);
    g = drag(g, 'fill', [1]);
    g = drag(g, 'x', [2, 1]); // 1 is filled, so X skips it
    expect(g.cells.slice(0, 3).map((c) => c.s)).toEqual([2, 1, 2]);
    g = drag(g, 'fill', [0, 1, 2]); // starts on X, so fill mode; 1 already filled
    expect(g.cells.slice(0, 3).map((c) => c.s)).toEqual([1, 1, 1]);
  });

  it('records who filled each cell', () => {
    let g = initGame(heart);
    g = drag(g, 'fill', [5, 6], 0);
    g = drag(g, 'fill', [7], 1);
    expect(countBy(g.cells)).toEqual([2, 1]);
    expect(ownerString(g.cells).slice(5, 9)).toBe('001.');
  });

  it('ignores empty strokes for undo', () => {
    let g = initGame(heart);
    g = drag(g, 'x', [0]);
    g = drag(g, 'fill', [1]);
    const before = g.undo.length;
    g = drag(g, 'x', [1]); // starts on filled; X tool marks blanks only, nothing changes
    expect(g.undo.length).toBe(before);
  });
});

describe('undo', () => {
  it('reverts the last stroke as one step', () => {
    let g = initGame(heart);
    g = drag(g, 'fill', [5, 6, 7, 8]);
    g = undo(g);
    expect(g.cells.every((c) => c.s === 0)).toBe(true);
    expect(g.undo).toHaveLength(0);
  });

  it('does not wipe a cell someone changed afterwards', () => {
    let g = initGame(heart);
    g = drag(g, 'fill', [5, 6], 0);
    // Partner overwrites cell 6 with an X (arrives from the server, not on our undo stack).
    const partner: Cell = { s: 2, by: 1 };
    g = gameReducer(g, { type: 'remote', changes: [{ i: 6, prev: g.cells[6], next: partner }] });
    expect(g.undo).toHaveLength(1);
    g = undo(g);
    expect(g.cells[5].s).toBe(0);
    expect(g.cells[6]).toEqual(partner);
  });

  it('undoes start over', () => {
    let g = drag(initGame(heart), 'fill', [5, 6, 7]);
    g = clear(g);
    expect(g.cells.every((c) => c.s === 0)).toBe(true);
    g = undo(g);
    expect(g.cells.slice(5, 8).map((c) => c.s)).toEqual([1, 1, 1]);
  });
});

describe('remote changes', () => {
  it('can finish the puzzle for both players', () => {
    let g = drag(initGame(heart), 'fill', solutionCells().slice(0, -1));
    const last = solutionCells().slice(-1)[0];
    g = gameReducer(g, { type: 'remote', changes: [{ i: last, prev: g.cells[last], next: { s: 1, by: 1 } }] });
    expect(g.solved).toBe(true);
  });
});

describe('check, hint, win', () => {
  it('flags wrong fills and X marks on cells that should be filled', () => {
    let g = initGame(heart);
    g = drag(g, 'fill', [0]); // should be blank
    g = drag(g, 'x', [1]); // should be filled
    g = drag(g, 'fill', [5]); // correct
    expect(mistakes(heart, g.cells)).toEqual([0, 1]);
  });

  it('hint fills a correct cell and is undoable', () => {
    let g = initGame(heart);
    g = gameReducer(g, { type: 'local', stroke: { by: 1, changes: [hintChange(heart, g.cells, 1, () => 0)!] } });
    const i = g.cells.findIndex((c) => c.s === 1);
    expect(heart.solution[i]).toBe(1);
    expect(g.cells[i].by).toBe(1);
    g = undo(g);
    expect(g.cells[i].s).toBe(0);
  });

  it('detects a win and then locks the board', () => {
    let g = initGame(heart);
    g = drag(g, 'fill', solutionCells().slice(0, -1));
    expect(g.solved).toBe(false);
    g = drag(g, 'fill', solutionCells().slice(-1));
    expect(g.solved).toBe(true);
    const after = drag(g, 'fill', [0]);
    expect(after).toBe(g);
    expect(gameReducer(g, { type: 'undo', changes: [] })).toBe(g);
  });

  it('counts X marks as blank for clues and wins', () => {
    let g = initGame(heart);
    g = drag(g, 'fill', solutionCells());
    g = { ...g, solved: false };
    const withX = g.cells.map((c) => (c.s === 0 ? ({ s: 2, by: 0 } as Cell) : c));
    expect(isSolved(heart, withX)).toBe(true);
  });

  it('reports satisfied lines', () => {
    const cells = emptyBoard(5);
    const sat = satisfiedLines(heart, cells);
    expect(sat.rows.every((v) => !v)).toBe(true);
    const blankRowPuzzle = puzzleFromRows('t', 't', ['#.', '..']);
    expect(satisfiedLines(blankRowPuzzle, emptyBoard(2)).rows).toEqual([false, true]);
  });
});
