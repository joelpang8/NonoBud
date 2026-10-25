/**
 * The 7 hand-drawn puzzles from the prototype, in its text format ('#' = filled).
 *
 * Three were edited by one symmetric pixel pair because the prototype versions
 * could not be solved by logic alone (the solver tests caught this):
 * - Cat: needed a guess. Ear tips widened (row 1).
 * - Star: needed a guess. Feet widened (row 8).
 * - Butterfly: had 5 different valid answers. Added a head pixel between the antennae (row 2).
 */

function mirror(half: string[]): string[] {
  return half.map((r) => r + r.slice(0, r.length - 1).split('').reverse().join(''));
}

export interface TextPuzzle {
  id: string;
  name: string;
  rows: string[];
}

export const PROTOTYPE_PUZZLES: TextPuzzle[] = [
  { id: 'p5-heart', name: 'Heart', rows: ['.#.#.', '#####', '#####', '.###.', '..#..'] },
  { id: 'p5-tree', name: 'Tree', rows: ['..#..', '.###.', '#####', '..#..', '..#..'] },
  {
    id: 'p10-heart',
    name: 'Big heart',
    rows: ['..........', '.###..###.', '##########', '##########', '##########', '.########.', '..######..', '...####...', '....##....', '..........'],
  },
  {
    id: 'p10-cat',
    name: 'Cat',
    rows: ['##......##', '##......##', '###....###', '##########', '##.####.##', '##########', '####..####', '##########', '.########.', '..######..'],
  },
  {
    id: 'p10-house',
    name: 'House',
    rows: ['....##....', '...####...', '..######..', '.########.', '##########', '.########.', '.########.', '.###..###.', '.###..###.', '.###..###.'],
  },
  {
    id: 'p10-star',
    name: 'Star',
    rows: ['....##....', '....##....', '...####...', '##########', '.########.', '..######..', '..######..', '####..####', '.##....##.', '#........#'],
  },
  {
    id: 'p15-butterfly',
    name: 'Butterfly',
    rows: mirror(['........', '.....#.#', '......#.', '###....#', '#####..#', '######.#', '######.#', '#####..#', '###....#', '####...#', '#####..#', '#####..#', '###....#', '##.....#', '........']),
  },
];
