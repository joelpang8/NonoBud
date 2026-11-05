// @vitest-environment node
import { createHash } from 'node:crypto';
import entries from './library.json';
import released from './released.json';

/**
 * Saved progress is tied to each puzzle's id and picture. Once a puzzle has been
 * played, changing its picture (or renaming its file, which changes its id)
 * would orphan or scramble boards in progress. This test fails if that happens.
 *
 * Adding new puzzles is always safe. After adding some, record them here with:
 *   npm run art && npm run release-puzzles
 */
describe('released puzzles never change', () => {
  const byId = new Map(entries.map((e) => [e.id, e]));
  it.each(Object.entries(released))('%s is unchanged', (id, hash) => {
    const e = byId.get(id);
    expect(e, `${id} was removed or renamed`).toBeDefined();
    expect(createHash('sha256').update(e!.rows.join('\n')).digest('hex').slice(0, 16), `${id}'s picture changed`).toBe(hash);
  });
});

describe('puzzle numbers never shift', () => {
  it('lists every size in release order, so new puzzles only ever go at the end', () => {
    const order = Object.keys(released);
    for (const n of [5, 10, 15, 20, 25, 30]) {
      const lib = entries.filter((e) => e.n === n).map((e) => e.id);
      const rel = order.filter((id) => lib.includes(id));
      expect(lib.slice(0, rel.length)).toEqual(rel);
    }
  });
});
