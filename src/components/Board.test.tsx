import { fireEvent, render, screen } from '@testing-library/react';
import { emptyBoard, puzzleFromRows, type Stroke } from '../game';
import { Board } from './Board';

const heart = puzzleFromRows('t-heart', 'Heart', ['.#.#.', '#####', '#####', '.###.', '..#..']);

function setup(tool: 'fill' | 'x' = 'fill') {
  const strokes: Stroke[] = [];
  const touches: number[] = [];
  render(<Board puzzle={heart} cells={emptyBoard(5)} player={1} tool={tool} cs={30} onStroke={(s) => strokes.push(s)} onTouch={(t) => touches.push(t)} />);
  const grid = screen.getByRole('grid');
  grid.focus();
  return { grid, strokes, touches };
}

describe('Board keyboard play', () => {
  it('moves with arrows and fills with Space', () => {
    const { grid, strokes, touches } = setup();
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: ' ' });
    expect(strokes).toHaveLength(1);
    expect(strokes[0].changes[0]).toMatchObject({ i: 6, next: { s: 1, by: 1 } });
    expect(touches).toEqual([1]);
    expect(grid.getAttribute('aria-activedescendant')).toMatch(/c6$/);
  });

  it('marks with X and stops at the edges', () => {
    const { grid, strokes } = setup();
    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    fireEvent.keyDown(grid, { key: 'x' });
    expect(strokes[0].changes[0]).toMatchObject({ i: 0, next: { s: 2 } });
  });

  it('Shift+arrow repeats the last action, like dragging', () => {
    const { grid, strokes } = setup();
    fireEvent.keyDown(grid, { key: 'Enter' });
    fireEvent.keyDown(grid, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(grid, { key: 'ArrowRight', shiftKey: true });
    expect(strokes.map((s) => s.changes[0].i)).toEqual([0, 1, 2]);
  });

  it('labels each cell with its row, column, clues and state for screen readers', () => {
    setup();
    expect(screen.getAllByRole('gridcell')).toHaveLength(25);
    expect(screen.getAllByRole('row')).toHaveLength(5);
    expect(screen.getAllByRole('gridcell')[1]).toHaveAccessibleName('Row 1 (clue 1 1), column 2 (clue 4): blank');
  });
});
