---
name: i18n-before-release
description: >
  Pre-release i18n actualization: strip unused en keys, then fill missing translations in all
  other locales via i18n-editor subagents. Trigger on "/i18n-before-release", "actualize i18n",
  "prepare i18n for release", "fill missing translations", "strip unused translation keys".
---

Pre-release i18n actualization: strip unused en keys, then fill missing translations in all other locales. All key detection is done by `.claude/skills/i18n-before-release/i18n-audit.mjs` (run from repo root) — never parse or diff locale JSON files yourself, and never read locale files directly (a hook blocks them; only the i18n-editor subagent may touch them).

## Steps

### 1. Find unused en keys

```bash
node .claude/skills/i18n-before-release/i18n-audit.mjs unused
```

The report has two buckets:

- **UNUSED** — the full key (with plural suffixes stripped) appears nowhere in `packages/{frontend,backend}/src`. Candidates for removal.
- **POSSIBLY DYNAMIC** — only matched via dynamic key construction (template literals, `'prefix.' +` concatenation). Treat these as **used**; do NOT review or strip them. Only mention the count.

Sanity-check the UNUSED bucket: pick ~5 keys from it and grep the codebase for each (search the full dotted path and the leaf segment). If any spot-check finds a real usage the script missed, STOP and report the gap to the user instead of stripping.

### 2. Confirm and strip

Show the user the UNUSED count and a compact list (key ids only), then ask via AskUserQuestion whether to strip all of them, skip stripping, or let them pick exclusions. On approval:

```bash
# write approved ids (fe:/be: prefixed, one per line) to a scratchpad file, then:
node .claude/skills/i18n-before-release/i18n-audit.mjs strip --keys-file <scratchpad-file>
node .claude/skills/i18n-before-release/i18n-audit.mjs prune-extra
```

`strip` removes the keys from en and mirrors the removal into every other locale. `prune-extra` then drops any non-en keys/files that have no en counterpart.

### 3. Find missing translations

```bash
node .claude/skills/i18n-before-release/i18n-audit.mjs missing
```

If nothing is missing, skip to step 5.

### 4. Translate via i18n-editor subagents

Spawn **one i18n-editor subagent per locale, in parallel** (they edit disjoint file trees). Prompt for each:

> This is an explicit pre-release bulk-translate pass into locale `<code>` — editing non-en locale files IS the assignment; treat en as read-only source. Run `node .claude/skills/i18n-before-release/i18n-audit.mjs missing --json --locale <code>` from the repo root to get your full work list: every missing key with its target file (frontend chunk path relative to `packages/frontend/src/i18n/locales/chunks/<code>/`, or `packages/backend/src/i18n/locales/<code>.json` for backend) and the en source value. Translate each value into `<code>` and insert it at the same key path, preserving `{named}` interpolation placeholders, `@:` linked-message references, and vue-i18n `|` plural separators verbatim in structure. Read files with `cat -n` (Read tool is hook-blocked), edit with Edit, validate JSON after. Report a per-file count of added keys.

Translation quality notes: match the tone of existing translations in the same file; domain terms (account, transaction, portfolio, holding) should reuse the wording already established in that locale.

### 5. Verify

```bash
node .claude/skills/i18n-before-release/i18n-audit.mjs missing
```

Must print "All locales are complete". If keys remain, re-spawn the affected locale's subagent once with the remaining list; if it still fails, report which keys are stuck instead of retrying further. (This run also re-parses every locale file, so it doubles as JSON validation.)

### 6. Wrap up

Report: keys stripped, keys pruned, keys translated per locale. Remind the user to review `git diff`, commit themselves (never commit for them), and run `npm run i18n:crowdin:upload` to sync translations to Crowdin.
