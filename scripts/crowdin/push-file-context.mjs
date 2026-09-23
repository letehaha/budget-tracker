#!/usr/bin/env node
// Sets each Crowdin source file's context from docs/i18n/file-context.json, keyed by Crowdin file path.
// Token scopes: Projects → Source files & strings (read/write).
// Usage: npm run i18n:crowdin:file-context [-- --dry-run]
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ROOT, createCrowdinClient } from './client.mjs';

const FILE = path.join(ROOT, 'docs/i18n/file-context.json');
const DRY_RUN = process.argv.includes('--dry-run');

const contexts = JSON.parse(readFileSync(FILE, 'utf-8'));
const { projectId, request, listAll } = createCrowdinClient();

const files = await listAll({ path: `/projects/${projectId}/files` });
const crowdinPaths = new Set(files.map((file) => file.path));
const unknown = Object.keys(contexts).filter((filePath) => !crowdinPaths.has(filePath));
const uncovered = files.filter((file) => !Object.hasOwn(contexts, file.path));
const changed = files.filter(
  (file) => Object.hasOwn(contexts, file.path) && (file.context ?? '') !== contexts[file.path],
);

for (const file of changed) console.log(`update ${file.path}`);
console.log(`${changed.length} to update, ${Object.keys(contexts).length - unknown.length - changed.length} unchanged`);
if (unknown.length) console.log(`in file-context.json but not in Crowdin: ${unknown.join(', ')}`);
if (uncovered.length) console.log(`in Crowdin without an entry: ${uncovered.map((file) => file.path).join(', ')}`);

if (DRY_RUN) process.exit(0);

try {
  for (const file of changed) {
    await request({
      method: 'PATCH',
      path: `/projects/${projectId}/files/${file.id}`,
      json: [{ op: 'replace', path: '/context', value: contexts[file.path] }],
    });
  }
  console.log(`done: ${changed.length} files updated`);
} catch (error) {
  console.error(`error: ${error.message}`);
  console.error('Rerun to continue: files already updated are skipped.');
  process.exit(1);
}
