import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('../../../../', import.meta.url).pathname;
const PUBLIC = new URL('../../public', import.meta.url).pathname;

const readEnv = () => {
  const env = {};
  for (const file of ['.env.development', '.env.development.local']) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) env[match[1]] = match[2].trim();
    }
  }
  return env;
};

const env = readEnv();
export const APP = process.env.DOCS_APP_URL ?? `https://localhost:${env.PORT}`;
export const API = process.env.DOCS_API_URL ?? `https://localhost:${env.APPLICATION_PORT}/api/v1`;
export const EMAIL = process.env.DOCS_USER_EMAIL ?? 'docs-test@example.com';
export const PASSWORD = process.env.DOCS_USER_PASSWORD ?? 'DocsTest!2026';
export const STATE = new URL('./.state.json', import.meta.url).pathname;

// Headless Chrome's default UA gets bank and brand logos blocked.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const PAD = 30;

export async function open({
  width = 1440,
  height = 1000,
  colorScheme = 'light',
  fresh = false,
  userAgent = USER_AGENT,
} = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: !fresh && existsSync(STATE) ? STATE : undefined,
    viewport: { width, height },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
    colorScheme,
    userAgent,
  });
  return { browser, ctx, page: await ctx.newPage() };
}

export async function api({ page, method = 'GET', path, body }) {
  return page.evaluate(
    async ({ url, method, body }) => {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      return { status: res.status, json };
    },
    { url: API + path, method, body },
  );
}

/** Innermost `div` containing every given text or locator — usually the card or section around them. */
export function innermost({ page, has }) {
  let locator = page.locator('div');
  for (const item of has) {
    locator = locator.filter({ has: typeof item === 'string' ? page.getByText(item, { exact: true }) : item });
  }
  return locator.last();
}

/** Clip rectangle around several locators, e.g. a trigger button plus the popover it opened. */
export async function clipAround({ locators, pad = PAD }) {
  const boxes = [];
  for (const locator of locators) {
    const box = await locator.boundingBox({ timeout: 3000 }).catch(() => null);
    if (!box) throw new Error(`clipAround: no bounding box for ${locator}`);
    boxes.push(box);
  }
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad };
}

/** Writes `public<src>`, or `<name>.dark.png` when `dark`. A locator `target` gets 30px of padding so shadows and rounded corners show. */
export async function shot({ page, src, target, clip, dark = false }) {
  await page.waitForTimeout(500);
  const path = join(PUBLIC, dark ? src.replace(/\.png$/, '.dark.png') : src);
  mkdirSync(dirname(path), { recursive: true });
  if (target && !clip) {
    await target.scrollIntoViewIfNeeded();
    clip = await clipAround({ locators: [target] });
    const viewport = page.viewportSize();
    if (clip.y + clip.height > viewport.height)
      throw new Error(`shot: ${src} is taller than the viewport; open() with a larger height`);
  }
  await page.screenshot({ path, clip, animations: 'disabled' });
  return path;
}

/** Runs `capture` once per theme. The app follows the OS color scheme unless the user picked a theme. */
export async function bothThemes({ page, capture }) {
  for (const dark of [false, true]) {
    await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
    await page.waitForTimeout(700);
    await capture({ dark });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}
