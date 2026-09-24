import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTENT_DIR = new URL('../src/content/docs/', import.meta.url).pathname;
const PUBLIC_DIR = new URL('../public', import.meta.url).pathname;
const SCREENSHOT_TAG = /<Screenshot\b[\s\S]*?\/>/g;
const attr = ({ tag, name }) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '';

const files = readdirSync(CONTENT_DIR, { recursive: true }).filter((f) => f.endsWith('.mdx'));
let missing = 0;

for (const file of files.sort()) {
  for (const [tag] of readFileSync(join(CONTENT_DIR, file), 'utf8').matchAll(SCREENSHOT_TAG)) {
    const src = attr({ tag, name: 'src' });
    if (existsSync(join(PUBLIC_DIR, src))) continue;
    missing++;
    console.log(
      `- [ ] public${src}\n      page: ${file}\n      what: ${attr({ tag, name: 'alt' })}\n      how:  ${attr({ tag, name: 'hint' })}\n`,
    );
  }
}

console.log(`${missing} screenshot(s) missing.`);
