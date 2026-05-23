---
name: find-slop
description: Hunt "AI slop" in this codebase — duplication, reinvented wheels, over-engineering, defensive cruft, dead code, comment slop, performance antipatterns. Auto-discovers candidate areas, asks the user which to investigate, runs parallel deep-dive subagents, and produces a terse actionable report. Does NOT apply fixes. Trigger on "/find-slop", "find slop", "find AI slop", "find refactor opportunities", "find duplicated code", "find dead code in <area>".
---

# find-slop

Find places in the codebase that read like they were written without context — duplication, premature abstractions, defensive cruft, reinvented wheels, dead code, performance antipatterns. The smell test is: **would a senior engineer who knows this codebase have written it this way?** If the answer is "no," that's slop worth surfacing.

**This skill DISCOVERS and REPORTS. It does NOT apply fixes.** The output is a terse curated report. A separate skill (or a follow-up Claude session) is expected to act on it.

## Invocation

- `/find-slop` — default: auto-discover ~5 candidate areas across the whole repo.
- `/find-slop <hint>` — focus discovery on a path, package, or feature name. Examples: `/find-slop investments`, `/find-slop packages/frontend`, `/find-slop src/auth`.
- `/find-slop --candidates N` — adjust the candidate count (default 5). Combinable with a hint: `/find-slop investments --candidates 3`.

Parse args yourself from the user's invocation. If unclear, ask the user once and proceed.

## Honesty rule (override everything else)

Do **NOT** pad to hit a count. At any stage:

- If discovery finds 2 areas worth investigating, propose 2. Not 5.
- If discovery finds nothing meaningful, say so and end the skill. Don't fabricate areas.
- If an investigator returns "no significant findings," report that as-is.
- If all investigators return clean, the final report can simply be "no significant findings in <areas>" — that is a successful run.

A clean report from a clean codebase is a win. Filling reports with weak findings trains the user to ignore them.

## Workflow

### Phase 1 — Read project conventions

Before discovery, read whichever of these exist (use `Glob` to confirm, then `Read`):

- `CLAUDE.md` at the repo root, and any nested ones obviously relevant
- `package.json` (or `pyproject.toml` / `go.mod` / `Cargo.toml`) — what deps are available
- `README.md` (high-level domain)
- `AGENTS.md` / `CONTRIBUTING.md` if present

You're capturing the project's idioms so you can pass them to investigators and prevent false positives. Do not deep-read everything — top-level only.

### Phase 2 — Discover candidate areas

Spawn one `Explore` subagent (model: sonnet) with a prompt like:

> Map the repo to identify ~N candidate areas likely to contain "AI slop" — duplication, over-engineering, defensive cruft, dead code, perf antipatterns. Signals to weight:
>
> - Parallel folders / near-identical filenames (duplication risk)
> - High file count or large files (over-engineering risk)
> - Many `try/catch` blocks, broad `catch` clauses, repeated `?? ''` patterns (defensive risk)
> - Util/helper folders with many small one-off functions (reinvented-wheels risk)
> - Areas with sparse imports from elsewhere (potential dead code)
> - Recently churned areas per git log (potential rush job)
>
> If the user passed a hint, scope to that. Skip `node_modules/`, `dist/`, `build/`, `.next/`, generated, vendor.
>
> Return at most N candidate areas with for each: a **name**, **path(s)**, a one-line **hypothesis** of likely slop type, and a one-line **why-it-stands-out**. Return fewer than N if signals don't justify N. Compact output only.

Once Explore returns, synthesize the candidate list. Apply the hint filter if not already applied. Drop candidates whose hypothesis you don't buy.

If you end up with zero candidates, tell the user honestly and end the skill.

### Checkpoint 1 — User picks areas

Use `AskUserQuestion` with `multiSelect: true` to present candidates.

- Each option's `label` = candidate name. `description` = the one-line hypothesis + path.
- If candidate count is ≥4, you can only show 4 in a single AskUserQuestion (max 4 options). When there are more candidates than 4, list them all in a brief markdown summary first, then ask via AskUserQuestion for the top 4 plus an "Other" / "Specify subset" implicit option (the user can answer with a custom list).

If user selects nothing, end the skill politely.

### Phase 3 — Parallel investigation

For each selected area, spawn the `slop-investigator` subagent.

**Spawn all investigators in a single message with multiple Agent tool calls** so they run in parallel.

Each Agent call:

- `subagent_type`: `"slop-investigator"`
- `model`: omit (let the agent definition's `opus` apply)
- `description`: short, e.g. `"Investigate slop in <area>"`
- `prompt`: a self-contained brief with:
  - Area name and exact path(s) / glob(s)
  - Hypothesis from discovery
  - Paths to conventions files you found in Phase 1
  - Slop categories in scope (default: all)
  - A reminder to output strictly in the format defined in the investigator's own instructions

Wait for all investigators to return.

### Phase 4 — Aggregate and present

Combine the investigator reports into a single Markdown document, grouped by area. Preserve the investigators' format verbatim — do not paraphrase or expand findings.

Show the consolidated report to the user in chat.

### Checkpoint 2 — User curates findings

After showing the consolidated report, ask the user (via `AskUserQuestion` or plain prompt) which findings they want to keep in the final report. This is the "would actually act on" filter — not the "is this true" filter.

If there are no findings to curate (everything came back clean), skip this step.

If the user wants all findings kept, skip filtering.

### Phase 5 — Final output

Emit the final Markdown report containing only the curated findings. Use this top-level structure:

```
# Slop Report

_Generated by /find-slop on <date>_

<one-line summary of scope: e.g. "Scanned 5 areas: ...; 3 with findings, 2 clean.">

## Findings

### <Area name 1>

- **Finding**: ...
  ...

### <Area name 2>

- No significant findings.

...
```

The report is the deliverable. Do not append commentary, next-steps, or "let me know if you'd like me to fix these" — the skill ends with the report. A future skill or session will consume it.

## What the investigators look for (cheat sheet)

The investigator agent has the full list, but a senior-SWE-level summary:

- **Duplication & reinvented wheels** — near-duplicate controllers/services/utils; hand-rolled helpers that match deps already in `package.json`.
- **Over-engineering & defensive slop** — abstractions used in one place; `try/catch` around non-throwing code; null checks on guaranteed-non-null values; backwards-compat shims with no users; silent error swallowing.
- **Dead code & comment slop** — unreferenced exports/params; always-one-value flags; comments restating code; paraphrase-the-signature docstrings; stale TODOs.
- **Performance antipatterns** — N+1 queries; sequential awaits that should be `Promise.all`; regex compiled in hot loop; large spreads/clones in render paths.

## Writing style (mandatory for all chat output)

When you report back to the user — candidate lists, phase updates, the consolidated report, summaries — write terse. Cognitive load is the point: the user is scanning, not reading.

Rules:

- **Drop**: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/of course/happy to/let me know if), hedging ("might possibly", "could potentially").
- **Fragments OK**. Short synonyms. Abbreviations OK for common terms (DB, auth, config, fn, impl, deps, perf).
- **Causality arrow** instead of "causes" / "leads to": `X -> Y`.
- **Pattern**: `[thing] [action/state] [reason]. [next].`

Technical identifiers, file paths, code, error messages: stay **exact**.

Do NOT apply this style to:

- The Markdown structure of the final report (`### Area`, **bold** labels, bullet hierarchy stay verbatim — investigators produce that).
- Code blocks, file:line references, quoted error strings.
- Security warnings or irreversible-action confirmations (use full sentences there).

Example chat update — bad (verbose):

> I've finished discovering candidate areas. The Explore subagent returned 5 candidates, and they all look credible to me based on the signals it surfaced. Would you like to proceed with selecting which ones to investigate?

Example chat update — good (terse):

> Discovery done. 5 candidates, all concrete. Pick which to investigate.

This style applies regardless of whether the user has the `caveman` skill installed — find-slop is self-contained.

## Anti-patterns (do NOT do)

- Do not skip Checkpoint 1. The user always picks which areas to investigate.
- Do not skip Phase 1 conventions reading. Without that, investigators produce false positives.
- Do not propose fixes inline. Report only. A separate skill applies fixes.
- Do not include code snippets of the slop in the report. `file:line` refs are enough.
- Do not flag style/formatting (linter's job), missing tests (different concern), or architectural opinions not backed by concrete slop.
- Do not analyze `node_modules/`, `dist/`, `build/`, `.next/`, generated, vendor paths.
- Do not pad the candidate list or the findings list to look productive.
- Do not modify any files. This skill is read-only.
- Do not commit, push, or do any git write operations. (Per project CLAUDE.md, always; per skill design, this one is read-only.)

## Portability note

This skill is designed to work in any codebase, not just this one. It does not hardcode project-specific paths or patterns. The investigator reads conventions per repo (`CLAUDE.md`, `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml`, `README.md`) and adapts.

To use in another project:

1. Copy `.claude/skills/find-slop/` and `.claude/agents/slop-investigator.md` into that project's `.claude/` directory.
2. **Restart your Claude Code session** before the first run. Subagents are loaded from `.claude/agents/` at session start — if the session was already open when the files were added, the `slop-investigator` subagent type will not be in the registry and Phase 3 will fail with `Agent type 'slop-investigator' not found`.
3. Run `/find-slop`.

If you ever see `Agent type 'slop-investigator' not found` mid-flow, that's the same root cause: restart the session and re-run. Do not fall back to `general-purpose` for investigation in production runs — the dedicated subagent's system prompt enforces the strict output format and honesty rule.
