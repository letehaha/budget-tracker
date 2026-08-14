#!/usr/bin/env node
/**
 * i18n audit tool. Subcommands:
 *   unused          Report en keys not referenced anywhere in source code.
 *                   Keys matched only by dynamic patterns (template literals,
 *                   "prefix." string concatenation) go to a separate
 *                   "possibly dynamic" bucket for manual review.
 *   strip           Remove exact keys (from --keys-file, one per line,
 *                   prefixed fe:/be:) from en AND all other locales.
 *   missing         Report keys present in en but absent in other locales.
 *                   --json includes en values so a translator needs no other input.
 *   prune-extra     Remove keys/files present in non-en locales but absent in en.
 *
 * Options: --json, --locale <code>, --keys-file <path>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FE_CHUNKS = path.join(ROOT, 'packages/frontend/src/i18n/locales/chunks');
const BE_LOCALES = path.join(ROOT, 'packages/backend/src/i18n/locales');
const SRC_DIRS = [path.join(ROOT, 'packages/frontend/src'), path.join(ROOT, 'packages/backend/src')];
const SRC_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.vue']);
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const hasFlag = (name) => args.includes(name);

// ---------- generic helpers ----------

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Invalid JSON in ${path.relative(ROOT, file)}: ${e.message}`);
    process.exit(1);
  }
};

const writeJson = (file, obj) => fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');

// Arrays are treated as leaves: vue-i18n arrays are addressed by their parent path.
function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

function deleteKeyPath(obj, keyPath) {
  const segs = keyPath.split('.');
  const stack = [];
  let node = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    if (node === null || typeof node !== 'object') return false;
    stack.push([node, segs[i]]);
    node = node[segs[i]];
  }
  const leaf = segs[segs.length - 1];
  if (node === null || typeof node !== 'object' || !(leaf in node)) return false;
  delete node[leaf];
  for (let i = stack.length - 1; i >= 0; i--) {
    const [parent, seg] = stack[i];
    if (Object.keys(parent[seg]).length === 0) delete parent[seg];
    else break;
  }
  return true;
}

function walkFiles(dir, filter, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkFiles(full, filter, out);
    } else if (filter(full)) out.push(full);
  }
  return out;
}

// ---------- locale file discovery ----------

function feLocales() {
  return fs
    .readdirSync(FE_CHUNKS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function beLocales() {
  return fs
    .readdirSync(BE_LOCALES)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.missing.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

// Returns Map<relPath, {file, keys: Map<key, value>}> for a frontend locale.
function feLocaleData(locale) {
  const dir = path.join(FE_CHUNKS, locale);
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const file of walkFiles(dir, (f) => f.endsWith('.json'))) {
    out.set(path.relative(dir, file), { file, keys: flatten(readJson(file)) });
  }
  return out;
}

function beLocaleData(locale) {
  const file = path.join(BE_LOCALES, `${locale}.json`);
  if (!fs.existsSync(file)) return null;
  return { file, keys: flatten(readJson(file)) };
}

// ---------- source-code corpus for usage detection ----------

function buildCorpus() {
  const files = SRC_DIRS.flatMap((dir) =>
    walkFiles(dir, (f) => SRC_EXTS.has(path.extname(f)) && !f.includes(`i18n${path.sep}locales`)),
  );
  let text = '';
  const dynamicPatterns = []; // arrays of ordered static fragments from `...${x}...` literals
  const dynamicPrefixes = []; // 'errors.' style concatenation prefixes

  // Every internal node of the en key tree, so a bare dotted string in source can be
  // recognised as a key prefix rather than as arbitrary text.
  const parentPaths = new Set();
  const collectParents = (keys) => {
    for (const key of keys.keys()) {
      const parts = key.split('.');
      for (let i = 2; i < parts.length; i++) parentPaths.add(parts.slice(0, i).join('.'));
    }
  };
  for (const { keys } of feLocaleData('en').values()) collectParents(keys);
  const beForParents = beLocaleData('en');
  if (beForParents) collectParents(beForParents.keys);

  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    text += content + '\n';

    // A prefix passed around as a plain string — a `label-key-prefix` prop, a config
    // constant — reaches `t(`${prefix}.${value}`)`, whose fragments are too thin to match.
    // Comments are excluded: prose there quotes key paths without referencing them.
    const code = content.replace(/\/\/[^\n]*/g, '').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of code.matchAll(/["'`]([\w][\w.\-]*\.[\w.\-]*\w)["'`]/g)) {
      if (parentPaths.has(m[1])) dynamicPrefixes.push(m[1] + '.');
    }

    for (const m of content.matchAll(/`([^`]*)`/gs)) {
      const lit = m[1];
      if (!lit.includes('${')) continue;
      const stripped = lit.replace(/\$\{[^}]*\}/g, '');
      if (!/^[\w.\-]*$/.test(stripped) || !stripped.includes('.')) continue;
      const fragments = lit.split(/\$\{[^}]*\}/).filter((s) => s.length >= 3 && /\w/.test(s));
      if (fragments.length > 0) dynamicPatterns.push(fragments);
    }

    for (const m of content.matchAll(/['"]([\w][\w.\-]*\.)['"]\s*\+/g)) {
      dynamicPrefixes.push(m[1]);
    }
  }

  // Linked messages inside en values (@:some.key / @:{'some.key'}) count as usage.
  const linkRefs = [];
  const collectLinks = (keys) => {
    for (const v of keys.values()) {
      if (typeof v !== 'string') continue;
      for (const m of v.matchAll(/@:(?:\{')?([\w.\-]+)/g)) linkRefs.push(m[1]);
    }
  };
  for (const { keys } of feLocaleData('en').values()) collectLinks(keys);
  const be = beLocaleData('en');
  if (be) collectLinks(be.keys);
  text += '\n' + linkRefs.join('\n');

  return { text, dynamicPatterns, dynamicPrefixes };
}

function classifyKey(key, corpus) {
  const base = key.replace(PLURAL_SUFFIX, '');
  if (corpus.text.includes(base)) return 'used';
  for (const prefix of corpus.dynamicPrefixes) {
    if (base.startsWith(prefix)) return 'dynamic';
  }
  for (const fragments of corpus.dynamicPatterns) {
    let pos = 0;
    let ok = true;
    for (const frag of fragments) {
      const idx = base.indexOf(frag, pos);
      if (idx === -1) {
        ok = false;
        break;
      }
      pos = idx + frag.length;
    }
    if (ok) return 'dynamic';
  }
  return 'unused';
}

// ---------- subcommands ----------

function enKeySources() {
  // [{id: 'fe:<key>'|'be:<key>', key, relPath}]
  const out = [];
  for (const [relPath, { keys }] of feLocaleData('en')) {
    for (const key of keys.keys()) out.push({ id: `fe:${key}`, key, relPath, side: 'fe' });
  }
  const be = beLocaleData('en');
  if (be) for (const key of be.keys.keys()) out.push({ id: `be:${key}`, key, relPath: 'en.json', side: 'be' });
  return out;
}

function cmdUnused() {
  const corpus = buildCorpus();
  const unused = [];
  const dynamic = [];
  const all = enKeySources();
  for (const entry of all) {
    const cls = classifyKey(entry.key, corpus);
    if (cls === 'unused') unused.push(entry);
    else if (cls === 'dynamic') dynamic.push(entry);
  }
  if (hasFlag('--json')) {
    console.log(
      JSON.stringify(
        {
          total: all.length,
          unused: unused.map((e) => ({ id: e.id, file: e.relPath })),
          possiblyDynamic: dynamic.map((e) => ({ id: e.id, file: e.relPath })),
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`Total en keys: ${all.length}`);
  console.log(`\nUNUSED (${unused.length}) — no reference found anywhere:`);
  for (const e of unused) console.log(`  ${e.id}  (${e.relPath})`);
  console.log(
    `\nPOSSIBLY DYNAMIC (${dynamic.length}) — only matched via dynamic key construction, review before stripping:`,
  );
  for (const e of dynamic) console.log(`  ${e.id}  (${e.relPath})`);
}

function cmdStrip() {
  const keysFile = opt('--keys-file');
  if (!keysFile) {
    console.error('strip requires --keys-file <path> (one fe:/be: prefixed key per line)');
    process.exit(1);
  }
  const ids = fs
    .readFileSync(keysFile, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const feData = new Map(feLocales().map((l) => [l, feLocaleData(l)]));
  const beData = new Map(beLocales().map((l) => [l, beLocaleData(l)]));
  const touched = new Map(); // file -> parsed json
  let removed = 0;

  const loadFile = (file) => {
    if (!touched.has(file)) touched.set(file, readJson(file));
    return touched.get(file);
  };

  for (const id of ids) {
    const [side, key] = [id.slice(0, 2), id.slice(3)];
    if (side === 'fe') {
      let relPath = null;
      for (const [rp, { keys }] of feData.get('en')) {
        if (keys.has(key)) {
          relPath = rp;
          break;
        }
      }
      if (!relPath) {
        console.error(`skip ${id}: not found in en chunks`);
        continue;
      }
      for (const locale of feData.keys()) {
        const chunk = feData.get(locale).get(relPath);
        if (chunk && deleteKeyPath(loadFile(chunk.file), key) && locale === 'en') removed++;
      }
    } else if (side === 'be') {
      for (const [locale, data] of beData) {
        if (data && deleteKeyPath(loadFile(data.file), key) && locale === 'en') removed++;
      }
    } else {
      console.error(`skip ${id}: expected fe:/be: prefix`);
    }
  }

  for (const [file, obj] of touched) writeJson(file, obj);
  console.log(`Removed ${removed} en key(s) (mirrored into all locales). Files written: ${touched.size}`);
}

function cmdMissing() {
  const onlyLocale = opt('--locale');
  const enFe = feLocaleData('en');
  const enBe = beLocaleData('en');
  const report = { frontend: {}, backend: {} };

  for (const locale of feLocales()) {
    if (locale === 'en' || (onlyLocale && locale !== onlyLocale)) continue;
    const data = feLocaleData(locale);
    const perFile = {};
    for (const [relPath, { keys: enKeys }] of enFe) {
      const locKeys = data.get(relPath)?.keys ?? new Map();
      const missing = {};
      for (const [key, value] of enKeys) {
        if (!locKeys.has(key)) missing[key] = value;
      }
      if (Object.keys(missing).length > 0) perFile[relPath] = missing;
    }
    if (Object.keys(perFile).length > 0) report.frontend[locale] = perFile;
  }

  for (const locale of beLocales()) {
    if (locale === 'en' || (onlyLocale && locale !== onlyLocale)) continue;
    const data = beLocaleData(locale);
    const missing = {};
    for (const [key, value] of enBe.keys) {
      if (!data.keys.has(key)) missing[key] = value;
    }
    if (Object.keys(missing).length > 0) report.backend[locale] = missing;
  }

  if (hasFlag('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  let total = 0;
  for (const [locale, perFile] of Object.entries(report.frontend)) {
    const count = Object.values(perFile).reduce((n, m) => n + Object.keys(m).length, 0);
    total += count;
    console.log(`frontend/${locale}: ${count} missing key(s) across ${Object.keys(perFile).length} file(s)`);
    for (const [relPath, missing] of Object.entries(perFile))
      console.log(`  ${relPath}: ${Object.keys(missing).length}`);
  }
  for (const [locale, missing] of Object.entries(report.backend)) {
    total += Object.keys(missing).length;
    console.log(`backend/${locale}: ${Object.keys(missing).length} missing key(s)`);
  }
  if (total === 0) console.log('All locales are complete — no missing keys.');
  else console.log(`\nTotal missing: ${total}. Run with --json --locale <code> for full detail incl. en values.`);
}

function cmdPruneExtra() {
  const enFe = feLocaleData('en');
  const enBe = beLocaleData('en');
  let removed = 0;
  let deletedFiles = 0;

  for (const locale of feLocales()) {
    if (locale === 'en') continue;
    for (const [relPath, { file, keys }] of feLocaleData(locale)) {
      const enChunk = enFe.get(relPath);
      if (!enChunk) {
        fs.rmSync(file);
        deletedFiles++;
        continue;
      }
      const obj = readJson(file);
      let changed = false;
      for (const key of keys.keys()) {
        if (!enChunk.keys.has(key)) {
          if (deleteKeyPath(obj, key)) {
            removed++;
            changed = true;
          }
        }
      }
      if (changed) writeJson(file, obj);
    }
  }

  for (const locale of beLocales()) {
    if (locale === 'en') continue;
    const { file, keys } = beLocaleData(locale);
    const obj = readJson(file);
    let changed = false;
    for (const key of keys.keys()) {
      if (!enBe.keys.has(key)) {
        if (deleteKeyPath(obj, key)) {
          removed++;
          changed = true;
        }
      }
    }
    if (changed) writeJson(file, obj);
  }
  console.log(`Pruned ${removed} extra key(s), deleted ${deletedFiles} orphan chunk file(s).`);
}

const commands = { unused: cmdUnused, strip: cmdStrip, missing: cmdMissing, 'prune-extra': cmdPruneExtra };
if (!commands[cmd]) {
  console.error(
    'Usage: i18n-audit.mjs <unused|strip|missing|prune-extra> [--json] [--locale <code>] [--keys-file <path>]',
  );
  process.exit(1);
}
commands[cmd]();
