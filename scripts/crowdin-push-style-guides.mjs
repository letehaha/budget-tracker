#!/usr/bin/env node
// Creates or updates (matched by exact name) the Crowdin style guides in docs/i18n/style-guide.
// Each guide gets its Markdown file via Storage (what translators see) and the same text as
// aiInstructions, so AI prompts carry the exact rules rather than Crowdin's auto-summary.
// Token scopes: Style guides (read/write) + Projects (read). CROWDIN_PERSONAL_TOKEN / CROWDIN_PROJECT_ID
// come from the environment, else .env.development.local.
// Usage: npm run i18n:crowdin:style-guides [-- --dry-run]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GUIDES_DIR = path.join(ROOT, 'docs/i18n/style-guide');
const LOCAL_ENV = path.join(ROOT, '.env.development.local');
const API_BASE = 'https://api.crowdin.com/api/v2';
const AI_INSTRUCTIONS_MAX_BYTES = 10240;
const PAGE_SIZE = 500;
const DRY_RUN = process.argv.includes('--dry-run');

const GUIDES = [
  { name: 'MoneyMatter – Shared', file: 'shared.md', languageIds: [] },
  { name: 'MoneyMatter – Ukrainian', file: 'uk.md', languageIds: ['uk'] },
].map((guide) => {
  const text = readFileSync(path.join(GUIDES_DIR, guide.file), 'utf-8');
  return { ...guide, text, bytes: Buffer.byteLength(text) };
});

for (const { name, file, bytes, languageIds } of GUIDES) {
  const fits = bytes <= AI_INSTRUCTIONS_MAX_BYTES;
  const languages = languageIds.length ? languageIds.join(', ') : 'all';
  console.log(
    `${name}: ${file}, ${bytes} bytes, languages: ${languages}, ${fits ? 'OK' : 'OVER'} (cap ${AI_INSTRUCTIONS_MAX_BYTES})`,
  );
}

if (GUIDES.some((guide) => guide.bytes > AI_INSTRUCTIONS_MAX_BYTES)) {
  console.error('error: aiInstructions is capped at 10240 bytes; shorten the files marked OVER.');
  process.exit(1);
}

if (DRY_RUN) process.exit(0);

function readVar({ name }) {
  if (process.env[name]) return process.env[name];
  let content = '';
  try {
    content = readFileSync(LOCAL_ENV, 'utf-8');
  } catch {}
  const line = content
    .split(/\r?\n/)
    .filter((entry) => entry.startsWith(`${name}=`))
    .at(-1);
  return line ? line.slice(name.length + 1) : '';
}

const token = readVar({ name: 'CROWDIN_PERSONAL_TOKEN' });
const projectId = Number(readVar({ name: 'CROWDIN_PROJECT_ID' }));

if (!token || !Number.isInteger(projectId) || projectId <= 0) {
  console.error('error: CROWDIN_PERSONAL_TOKEN and a numeric CROWDIN_PROJECT_ID must be set.');
  console.error(`       Add them to ${LOCAL_ENV} or export them before running.`);
  process.exit(1);
}

async function crowdin({ method, path: apiPath, json, body, headers = {} }) {
  const res = await fetch(`${API_BASE}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: json === undefined ? body : JSON.stringify(json),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${apiPath} failed with ${res.status}: ${text}`);
  return JSON.parse(text).data;
}

async function listStyleGuides() {
  const guides = [];
  for (let offset = 0; ; ) {
    const page = await crowdin({
      method: 'GET',
      path: `/style-guides?limit=${PAGE_SIZE}&offset=${offset}`,
    });
    if (!page.length) return guides;
    guides.push(...page.map((item) => item.data));
    offset += page.length;
  }
}

async function pushGuide({ guide, existing }) {
  const matches = existing.filter((item) => item.name === guide.name);
  if (matches.length > 1) {
    throw new Error(
      `${matches.length} style guides are named "${guide.name}" (ids ${matches.map((m) => m.id)}); delete the extras.`,
    );
  }

  const storage = await crowdin({
    method: 'POST',
    path: '/storages',
    headers: {
      'Content-Type': 'text/markdown',
      'Crowdin-API-FileName': encodeURIComponent(guide.file),
    },
    body: guide.text,
  });

  const fields = {
    name: guide.name,
    languageIds: guide.languageIds,
    projectIds: [projectId],
    storageId: storage.id,
    aiInstructions: guide.text,
  };
  const [match] = matches;
  const result = match
    ? await crowdin({
        method: 'PATCH',
        path: `/style-guides/${match.id}`,
        json: Object.entries(fields).map(([key, value]) => ({
          op: 'replace',
          path: `/${key}`,
          value,
        })),
      })
    : await crowdin({ method: 'POST', path: '/style-guides', json: fields });

  const languages = result.languageIds?.length ? result.languageIds.join(', ') : 'all';
  console.log(
    `${match ? 'updated' : 'created'} "${result.name}": id ${result.id}, languages: ${languages}, projects: ${result.projectIds?.join(', ')}, storage ${storage.id}`,
  );
  if (result.aiInstructions !== guide.text) {
    console.warn(
      `  warning: returned aiInstructions differ from ${guide.file}; check the AI-Ready Version in Crowdin.`,
    );
  }
}

try {
  const existing = await listStyleGuides();
  for (const guide of GUIDES) await pushGuide({ guide, existing });
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}
