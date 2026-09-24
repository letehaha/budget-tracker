import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

// Rewrites every screenshot as a 256-colour palette PNG in place: about a third of the size, visually identical for UI shots.
// Already-optimized files are skipped, so it is safe to run on every build.
const DIR = new URL('../public/screenshots/', import.meta.url).pathname;

let before = 0;
let after = 0;
let optimized = 0;

for (const file of readdirSync(DIR, { recursive: true }).filter((f) => f.endsWith('.png'))) {
  const path = join(DIR, file);
  if ((await sharp(path).metadata()).isPalette) continue;
  before += statSync(path).size;
  const out = await sharp(readFileSync(path)).png({ palette: true, quality: 90, effort: 10 }).toBuffer();
  writeFileSync(path, out);
  after += out.length;
  optimized++;
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(`Optimized ${optimized} screenshot(s): ${mb(before)} MB -> ${mb(after)} MB`);
