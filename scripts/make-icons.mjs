// Renders the Cellmates logo (two colored squares on a 2x2 grid) to PNG icons.
// Run with: npm run icons
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [0x11, 0x14, 0x2a];
const ROSE = [0xff, 0x6b, 0x8f];
const TEAL = [0x38, 0xcf, 0xc8];
const LINE = [0x2b, 0x30, 0x59];

/** pad: fraction of the icon left empty around the logo (maskable icons need a safe zone). */
function icon(size, pad) {
  const png = new PNG({ width: size, height: size });
  const inner = size * (1 - pad * 2);
  const off = size * pad;
  const tile = (inner / 2) * 0.92;
  const gap = inner / 2 - tile;
  const r = tile * 0.15;
  const tiles = [
    [0, 0, ROSE],
    [1, 0, LINE],
    [0, 1, LINE],
    [1, 1, TEAL],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c = BG;
      for (const [tx, ty, col] of tiles) {
        const x0 = off + tx * (tile + gap * 2);
        const y0 = off + ty * (tile + gap * 2);
        const px = x + 0.5 - x0;
        const py = y + 0.5 - y0;
        if (px < 0 || py < 0 || px > tile || py > tile) continue;
        // rounded corners
        const cx = Math.min(px, tile - px);
        const cy = Math.min(py, tile - py);
        if (cx < r && cy < r && (r - cx) ** 2 + (r - cy) ** 2 > r * r) continue;
        c = col;
      }
      const i = (y * size + x) * 4;
      png.data[i] = c[0];
      png.data[i + 1] = c[1];
      png.data[i + 2] = c[2];
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192, 0.16));
writeFileSync('public/icons/icon-512.png', icon(512, 0.16));
writeFileSync('public/icons/icon-maskable-512.png', icon(512, 0.24));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, 0.16));
writeFileSync(
  'public/icons/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.2 -0.2 2.4 2.4"><rect x="-0.2" y="-0.2" width="2.4" height="2.4" rx=".4" fill="#11142A"/><rect width=".92" height=".92" rx=".14" fill="#FF6B8F"/><rect x="1.08" y="1.08" width=".92" height=".92" rx=".14" fill="#38CFC8"/><rect x="1.08" width=".92" height=".92" rx=".14" fill="#2B3059"/><rect y="1.08" width=".92" height=".92" rx=".14" fill="#2B3059"/></svg>\n`,
);
console.log('Icons written to public/icons');
