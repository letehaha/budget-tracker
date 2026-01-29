/**
 * Post-build script for prerender separation.
 *
 * Problem: The prerenderer writes fully-rendered landing page HTML into dist/index.html.
 * Since nginx uses index.html as the SPA fallback for ALL routes, visiting /dashboard
 * or any non-landing route briefly flashes the landing page content before Vue replaces it.
 *
 * Solution: Copy the prerendered index.html to landing.html, then strip the prerendered
 * content from index.html to restore a clean SPA shell. Nginx serves landing.html
 * for exact "/" and clean index.html for all other routes.
 *
 * The stripping uses div-depth counting to find the matching closing </div> for #app,
 * since the prerendered content contains many nested </div> tags.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const indexPath = path.join(distDir, 'index.html');
const landingPath = path.join(distDir, 'landing.html');

const html = fs.readFileSync(indexPath, 'utf-8');

// Find the #app div opening tag (may have attributes like data-v-app)
const appOpenMatch = html.match(/<div\s[^>]*id="app"[^>]*>/);
if (!appOpenMatch) {
  console.log('[post-build-prerender] Could not find <div id="app"> in index.html, skipping.');
  process.exit(0);
}

const appOpenTag = appOpenMatch[0];
const contentStart = appOpenMatch.index + appOpenTag.length;

// Check if there's any content inside #app (if not, prerendering didn't run)
const quickCheck = html.substring(contentStart, contentStart + 20).trim();
if (quickCheck.startsWith('</div>') || quickCheck === '') {
  console.log('[post-build-prerender] index.html has no prerendered content inside #app, skipping.');
  process.exit(0);
}

// Find the matching closing </div> by counting depth
let depth = 1;
let pos = contentStart;
const openDivRe = /<div[\s>]/g;
const closeDivRe = /<\/div>/g;

// Collect all div open/close positions after contentStart
const tags = [];
openDivRe.lastIndex = contentStart;
closeDivRe.lastIndex = contentStart;

let m;
while ((m = openDivRe.exec(html)) !== null) {
  tags.push({ pos: m.index, type: 'open' });
}
while ((m = closeDivRe.exec(html)) !== null) {
  tags.push({ pos: m.index, type: 'close' });
}

// Sort by position
tags.sort((a, b) => a.pos - b.pos);

let closingDivPos = -1;
for (const tag of tags) {
  if (tag.type === 'open') {
    depth++;
  } else {
    depth--;
    if (depth === 0) {
      closingDivPos = tag.pos;
      break;
    }
  }
}

if (closingDivPos === -1) {
  console.error('[post-build-prerender] Could not find matching closing </div> for #app.');
  process.exit(1);
}

// 1. Copy prerendered version as landing.html
fs.copyFileSync(indexPath, landingPath);
console.log('[post-build-prerender] Copied prerendered index.html → landing.html');

// 2. Strip prerendered content: keep everything before content + everything from closing </div>
const cleanHtml = html.substring(0, contentStart) + html.substring(closingDivPos);
fs.writeFileSync(indexPath, cleanHtml, 'utf-8');
console.log('[post-build-prerender] Restored clean index.html (empty #app)');
