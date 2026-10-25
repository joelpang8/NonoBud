/**
 * Turns every PNG in /art into a puzzle and writes src/puzzles/library.json.
 *
 *   npm run art
 *
 * Rules for the pictures:
 * - Square, and 5, 10, 15 or 20 pixels wide (or scaled up evenly, e.g. 16 px per cell).
 * - Dark pixels are filled cells. White or transparent pixels are blank.
 * - The file name becomes the puzzle name: "big-heart.png" -> "Big heart".
 *
 * Each picture is checked: it must have exactly one answer and be solvable
 * without guessing. Pictures that fail are skipped with a note saying which
 * rows to look at.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PNG } from 'pngjs';
import { checkPicture, imageToSolution, nameFromFile, slug, toRows, type LibraryEntry } from '../src/puzzles/art';

const ART = 'art';
const OUT = 'src/puzzles/library.json';

const files = readdirSync(ART)
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .sort();

const entries: LibraryEntry[] = [];
const problems: string[] = [];
const ids = new Set<string>();

for (const file of files) {
  const base = basename(file, '.png');
  try {
    const png = PNG.sync.read(readFileSync(join(ART, file)));
    const { n, solution } = imageToSolution(png.width, png.height, png.data);
    const verdict = checkPicture(n, solution);
    if (!verdict.ok) {
      problems.push(`${file}: skipped, ${verdict.reason}`);
      continue;
    }
    const id = `p${n}-${slug(base)}`;
    if (ids.has(id)) {
      problems.push(`${file}: skipped, another ${n}×${n} picture already has this name`);
      continue;
    }
    ids.add(id);
    entries.push({ id, name: nameFromFile(base), n, rows: toRows(n, solution), passes: verdict.passes });
    console.log(`  ok  ${file.padEnd(28)} ${n}×${n}, ${verdict.passes} solver passes`);
  } catch (e) {
    problems.push(`${file}: skipped, ${(e as Error).message}`);
  }
}

// Order: by size, then easiest first, then by name.
entries.sort((a, b) => a.n - b.n || a.passes - b.passes || a.name.localeCompare(b.name));
writeFileSync(OUT, JSON.stringify(entries, null, 1) + '\n');

console.log(`\nWrote ${entries.length} puzzles to ${OUT}`);
if (problems.length) {
  console.log(`\n${problems.length} picture(s) need attention:`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exitCode = 1;
}
