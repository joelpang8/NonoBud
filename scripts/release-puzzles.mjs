// Records every puzzle in src/puzzles/library.json as released, so tests stop
// anyone (including future you) from changing a puzzle people have progress on.
// Existing entries are never rewritten, only new ones are added.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const lib = JSON.parse(readFileSync('src/puzzles/library.json', 'utf8'));
const path = 'src/puzzles/released.json';
const released = JSON.parse(readFileSync(path, 'utf8'));
let added = 0;
for (const e of lib) {
  if (released[e.id]) continue;
  released[e.id] = createHash('sha256').update(e.rows.join('\n')).digest('hex').slice(0, 16);
  added++;
}
const sorted = Object.fromEntries(Object.entries(released).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(path, JSON.stringify(sorted, null, 1) + '\n');
console.log(`Released ${added} new puzzle(s); ${Object.keys(sorted).length} in total.`);
