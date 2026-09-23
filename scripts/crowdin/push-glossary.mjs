#!/usr/bin/env node
// Syncs docs/i18n/glossary.json into the glossary assigned to the Crowdin project. The file owns each
// concept's definition, do-not-translate flag, English terms and Ukrainian terms; other languages'
// terms stay as translators made them. Concepts match by English term; entries sharing a term
// (homonyms) pair with Crowdin concepts in file order against creation order.
// Token scopes: Glossaries (read/write) + Projects (read).
// Usage: npm run i18n:crowdin:glossary [-- --dry-run] [-- --prune]
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ROOT, createCrowdinClient } from './client.mjs';

const FILE = path.join(ROOT, 'docs/i18n/glossary.json');
const DRY_RUN = process.argv.includes('--dry-run');
const PRUNE = process.argv.includes('--prune');
const MANAGED_LANGUAGES = new Set(['en', 'uk']);
const PARTS_OF_SPEECH = new Set([
  'adjective',
  'adposition',
  'adverb',
  'auxiliary',
  'coordinating conjunction',
  'determiner',
  'interjection',
  'noun',
  'numeral',
  'particle',
  'pronoun',
  'proper noun',
  'subordinating conjunction',
  'verb',
  'other',
]);

const entries = JSON.parse(readFileSync(FILE, 'utf-8'));
const keyOf = (text) => text.trim().toLowerCase();

const problems = [];
const seen = new Set();
entries.forEach((entry, index) => {
  const at = `#${index} "${entry.term}"`;
  for (const field of ['term', 'definition', 'uk']) {
    if (typeof entry[field] !== 'string' || !entry[field].trim()) problems.push(`${at}: ${field} is required`);
  }
  if (!PARTS_OF_SPEECH.has(entry.partOfSpeech)) problems.push(`${at}: unknown partOfSpeech "${entry.partOfSpeech}"`);
  if (typeof entry.translatable !== 'boolean') problems.push(`${at}: translatable must be true or false`);
  const id = `${keyOf(entry.term ?? '')}\n${entry.definition}`;
  if (seen.has(id)) problems.push(`${at}: duplicate term and definition`);
  seen.add(id);
});
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(
  `glossary.json: ${entries.length} entries, ${entries.filter((entry) => !entry.translatable).length} do-not-translate`,
);

const { projectId, request, listAll } = createCrowdinClient();

const project = await request({ method: 'GET', path: `/projects/${projectId}` });
const assigned = project.assignedGlossaries ?? [];
if (assigned.length !== 1) {
  console.error(`error: expected one glossary assigned to project ${projectId}, found ${assigned.length}.`);
  process.exit(1);
}
const base = `/glossaries/${assigned[0]}`;
const concepts = (await listAll({ path: `${base}/concepts` })).sort((a, b) => a.id - b.id);
const terms = (await listAll({ path: `${base}/terms` })).sort((a, b) => a.id - b.id);

const termsByConcept = Map.groupBy(terms, (term) => term.conceptId);
const primaryOf = (conceptId) => {
  const english = (termsByConcept.get(conceptId) ?? []).filter((term) => term.languageId === 'en');
  return english.find((term) => term.status === 'preferred') ?? english[0];
};
const conceptsByKey = Map.groupBy(
  concepts.filter((concept) => primaryOf(concept.id)),
  (concept) => keyOf(primaryOf(concept.id).text),
);
const pairs = entries.map((entry) => ({ entry, concept: conceptsByKey.get(keyOf(entry.term))?.shift() }));
const unmatched = [...conceptsByKey.values()].flat();

function wantedTerms({ entry }) {
  return [
    { languageId: 'en', text: entry.term, status: 'preferred', description: entry.definition },
    ...(entry.variants ?? []).map((text) => ({ languageId: 'en', text, status: 'admitted' })),
    { languageId: 'uk', text: entry.uk, status: 'preferred', description: entry.ukNote },
    ...(entry.ukAvoid ?? []).map((text) => ({ languageId: 'uk', text, status: 'not recommended' })),
  ].map((term) => ({ ...term, description: term.description ?? '', partOfSpeech: entry.partOfSpeech }));
}

function planEntry({ entry, concept }) {
  const existing = concept
    ? (termsByConcept.get(concept.id) ?? []).filter((term) => MANAGED_LANGUAGES.has(term.languageId))
    : [];
  const primary = concept ? primaryOf(concept.id) : undefined;
  const unclaimed = new Set(existing);
  const create = [];
  const patch = [];

  for (const [index, want] of wantedTerms({ entry }).entries()) {
    const match =
      [...unclaimed].find((term) => term.languageId === want.languageId && term.text === want.text) ??
      (index === 0 && unclaimed.has(primary) ? primary : undefined);
    if (!match) {
      create.push(want);
      continue;
    }
    unclaimed.delete(match);
    const ops = ['text', 'description', 'partOfSpeech', 'status']
      .filter((field) => (match[field] ?? '') !== want[field])
      .map((field) => ({ op: 'replace', path: `/${field}`, value: want[field] }));
    if (ops.length) patch.push({ term: match, ops });
  }

  const conceptChanged =
    !concept || (concept.definition ?? '') !== entry.definition || concept.translatable !== entry.translatable;
  return { entry, concept, create, patch, remove: [...unclaimed], conceptChanged };
}

const plans = pairs.map(planEntry);
const changed = plans.filter(
  (plan) => plan.create.length || plan.patch.length || plan.remove.length || plan.conceptChanged,
);

for (const plan of changed) {
  const parts = [
    plan.create.length && `+${plan.create.map((term) => `${term.languageId}:${term.text}`).join(', ')}`,
    plan.patch.length &&
      `~${plan.patch.map(({ term, ops }) => `${term.languageId}:${term.text}(${ops.map((op) => op.path.slice(1))})`).join(', ')}`,
    plan.remove.length && `-${plan.remove.map((term) => `${term.languageId}:${term.text}`).join(', ')}`,
    plan.concept && plan.conceptChanged && 'concept',
  ].filter(Boolean);
  console.log(`${plan.concept ? `update #${plan.concept.id}` : 'create'} "${plan.entry.term}": ${parts.join('; ')}`);
}
const unmatchedLabel = (concept) => `#${concept.id} "${primaryOf(concept.id).text}"`;
console.log(
  `${plans.filter((plan) => !plan.concept).length} to create, ${changed.filter((plan) => plan.concept).length} to update, ${plans.length - changed.length} unchanged`,
);
if (unmatched.length) {
  console.log(
    `${unmatched.length} Crowdin concepts not in glossary.json${PRUNE ? ' (deleting)' : ' (kept; --prune deletes them)'}: ${unmatched.map(unmatchedLabel).join(', ')}`,
  );
}

if (DRY_RUN) process.exit(0);

async function applyPlan({ entry, concept, create, patch, remove, conceptChanged }) {
  let conceptId = concept?.id;
  for (const term of create) {
    const created = await request({
      method: 'POST',
      path: `${base}/terms`,
      json: { ...term, description: term.description || undefined, conceptId },
    });
    conceptId ??= created.conceptId;
  }
  for (const { term, ops } of patch) {
    await request({ method: 'PATCH', path: `${base}/terms/${term.id}`, json: ops });
  }
  for (const term of remove) {
    await request({ method: 'DELETE', path: `${base}/terms/${term.id}` });
  }
  if (conceptChanged) {
    const kept = Object.fromEntries(
      ['subject', 'note', 'url', 'figure'].filter((field) => concept?.[field]).map((field) => [field, concept[field]]),
    );
    const languagesDetails = (concept?.languagesDetails ?? []).map(({ languageId, definition, note }) => ({
      languageId,
      definition,
      ...(note ? { note } : {}),
    }));
    await request({
      method: 'PUT',
      path: `${base}/concepts/${conceptId}`,
      json: { ...kept, languagesDetails, definition: entry.definition, translatable: entry.translatable },
    });
  }
}

try {
  let done = 0;
  for (const plan of changed) {
    await applyPlan(plan);
    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${changed.length}`);
  }
  if (PRUNE) {
    for (const concept of unmatched) await request({ method: 'DELETE', path: `${base}/concepts/${concept.id}` });
  }
  console.log(`done: ${changed.length} concepts written${PRUNE ? `, ${unmatched.length} deleted` : ''}`);
} catch (error) {
  console.error(`error: ${error.message}`);
  console.error('Rerun to continue: concepts already written match and are skipped.');
  process.exit(1);
}
