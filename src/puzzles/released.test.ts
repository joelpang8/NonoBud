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
