#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../packages/frontend/public');
const INDEX_PATH = path.join(PUBLIC_DIR, '.well-known/agent-skills/index.json');
const SITE_ORIGIN = 'https://moneymatter.app';

const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));

let changed = false;
for (const skill of index.skills) {
  if (!skill.url.startsWith(`${SITE_ORIGIN}/`)) {
    throw new Error(`Skill url must be rooted at ${SITE_ORIGIN}: got ${skill.url}`);
  }
  const relative = skill.url.slice(SITE_ORIGIN.length + 1);
  const filePath = path.join(PUBLIC_DIR, relative);
  const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex');

  if (skill.sha256 !== digest) {
    skill.sha256 = digest;
    changed = true;
  }
}

if (changed) {
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');
  console.log('regen-agent-skills-index: updated index.json');
}
