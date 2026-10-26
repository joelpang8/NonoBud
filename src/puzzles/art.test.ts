import { cluesFor, parseRows, solveGrid } from '../solver';
import { checkPicture, imageToSolution, nameFromFile, slug, splitSize, toRows } from './art';
import entries from './library.json';

/** Build RGBA pixels from text rows, scaled up by `k` pixels per cell. */
function rgba(rows: string[], k = 1, alpha = 255): Uint8Array {
  const n = rows.length * k;
  const out = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const on = rows[Math.floor(y / k)][Math.floor(x / k)] === '#';
      out.set(on ? [20, 20, 20, alpha] : [255, 255, 255, 255], (y * n + x) * 4);
    }
  return out;
}

const HEART = ['.#.#.', '#####', '#####', '.###.', '..#..'];

describe('imageToSolution', () => {
  it('reads one pixel per cell', () => {
    expect(imageToSolution(5, 5, rgba(HEART))).toMatchObject(parseRows(HEART));
  });

  it('reads scaled-up pixel art', () => {
    expect(imageToSolution(80, 80, rgba(HEART, 16))).toMatchObject(parseRows(HEART));
  });

  it('reads chunky pictures at the smallest size unless the file name says otherwise', () => {
    const blocky = HEART.flatMap((r) => [r.replace(/./g, (c) => c + c), r.replace(/./g, (c) => c + c)]); // a 10×10 drawn in 2×2 blocks
    expect(imageToSolution(160, 160, rgba(blocky, 16)).n).toBe(5);
    expect(imageToSolution(160, 160, rgba(blocky, 16), 10).n).toBe(10);
    expect(splitSize('sun@10')).toEqual({ base: 'sun', n: 10 });
    expect(splitSize('big-heart')).toEqual({ base: 'big-heart' });
  });

  it('treats transparent pixels as blank', () => {
    expect(imageToSolution(5, 5, rgba(HEART, 1, 0)).solution.every((v) => v === 0)).toBe(true);
  });

  it('rejects non-square and odd-sized images', () => {
    expect(() => imageToSolution(5, 6, new Uint8Array(5 * 6 * 4))).toThrow(/square/);
    expect(() => imageToSolution(7, 7, new Uint8Array(7 * 7 * 4))).toThrow(/5, 10, 15 or 20/);
  });
});

describe('checkPicture', () => {
  it('accepts a fair picture', () => {
    const { n, solution } = parseRows(HEART);
    expect(checkPicture(n, solution)).toEqual({ ok: true, passes: 2 });
  });

  it('explains pictures with several answers', () => {
    const { n, solution } = parseRows(['#....', '.#...', '.....', '.....', '.....']);
    const v = checkPicture(n, solution);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/more than one answer.*rows 1, 2/);
  });

  it('rejects blank pictures', () => {
    expect(checkPicture(5, new Array(25).fill(0)).ok).toBe(false);
  });
});

describe('names', () => {
  it('turns file names into puzzle names and ids', () => {
    expect(nameFromFile('big-heart')).toBe('Big heart');
    expect(nameFromFile('ice_cream')).toBe('Ice cream');
    expect(slug('Ice Cream!')).toBe('ice-cream');
    expect(toRows(5, parseRows(HEART).solution)).toEqual(HEART);
  });
});

describe('library.json', () => {
  it('has at least 27 puzzles covering every size', () => {
    expect(entries.length).toBeGreaterThanOrEqual(27);
    for (const n of [5, 10, 15, 20]) expect(entries.filter((e) => e.n === n).length).toBeGreaterThanOrEqual(4);
  });

  it('has unique ids', () => {
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });

  it('matches its pictures (rerun `npm run art` if this fails)', () => {
    for (const e of entries) {
      const { n, solution } = parseRows(e.rows);
      expect(n).toBe(e.n);
      const res = solveGrid(cluesFor(solution, n), n);
      expect(res.solved).toBe(true);
      expect(res.passes).toBe(e.passes);
    }
  });
});
