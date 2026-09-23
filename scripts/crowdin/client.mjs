// Shared Crowdin API v2 access for the one-off push scripts. CROWDIN_PERSONAL_TOKEN / CROWDIN_PROJECT_ID
// come from the environment, else .env.development.local.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL_ENV = path.join(ROOT, '.env.development.local');
const API_BASE = 'https://api.crowdin.com/api/v2';
const PAGE_SIZE = 500;

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

export function createCrowdinClient() {
  const token = readVar({ name: 'CROWDIN_PERSONAL_TOKEN' });
  const projectId = Number(readVar({ name: 'CROWDIN_PROJECT_ID' }));

  if (!token || !Number.isInteger(projectId) || projectId <= 0) {
    console.error('error: CROWDIN_PERSONAL_TOKEN and a numeric CROWDIN_PROJECT_ID must be set.');
    console.error(`       Add them to ${LOCAL_ENV} or export them before running.`);
    process.exit(1);
  }

  async function request({ method, path: apiPath, json, body, headers = {} }) {
    const res = await fetch(`${API_BASE}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(json === undefined ? { body } : { body: JSON.stringify(json) }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${apiPath} failed with ${res.status}: ${text}`);
    return text ? JSON.parse(text).data : null;
  }

  async function listAll({ path: apiPath }) {
    const items = [];
    const separator = apiPath.includes('?') ? '&' : '?';
    for (let offset = 0; ; ) {
      const page = await request({
        method: 'GET',
        path: `${apiPath}${separator}limit=${PAGE_SIZE}&offset=${offset}`,
      });
      if (!page.length) return items;
      items.push(...page.map((item) => item.data));
      offset += page.length;
    }
  }

  return { projectId, request, listAll };
}
