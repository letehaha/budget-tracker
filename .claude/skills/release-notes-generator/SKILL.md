---
name: release-notes-generator
description: Generates GitHub release notes by comparing commits since the last tag. Use when user says "prepare release", "release notes", "next release", "release text", "prepare next release text", or "create release".
allowed-tools: Bash, Read
---

# Release Notes Generator

Generates formatted release notes for the next GitHub release by analyzing commits and PRs since the last tag, following the project's established release format.

## Mode

This skill is a **direct execution workflow** — no questions needed. Gather all context from git history and PRs, then produce the release text.

## When to Use

- User asks to prepare release notes or release text
- User mentions "next release", "prepare release", "release notes"
- User wants to create a new GitHub release

## Instructions

### Step 1: Determine Last Release

Run these commands to identify the latest release tag and its format:

```bash
# Get the latest tag
git tag --sort=-creatordate | head -1

# View the latest release body to match its format
gh release view <latest-tag>
```

Also view 1-2 previous releases to understand the format pattern.

### Step 2: Collect Changes Since Last Release

```bash
# All commits (including merges) since last tag
git log <latest-tag>..HEAD --oneline

# Non-merge commits only — these are the primary source of truth for understanding changes
git log <latest-tag>..HEAD --oneline --no-merges

# Merged PRs with URLs (needed for the Code Changes section)
gh pr list --state merged --base main --limit 30 --json number,title,url | jq -r '.[] | "#\(.number) \(.title) \(.url)"'
```

Filter PRs to only those merged AFTER the latest tag date.

### Step 3: Understand Changes

For each PR, use a **priority chain** to understand what changed:

1. **PR description** (check first) — if the PR body is non-empty, use it as the primary source
2. **Commit messages** (fallback) — if PR description is empty, read the commit messages within that PR
3. **Diff stat** (last resort) — if commits are also unclear, check the changed files

```bash
# Check PR description first
gh pr view <number> --json title,body

# If empty, read commit messages
git log <latest-tag>..HEAD --oneline --no-merges

# Last resort — check what files changed
git show <commit-hash> --stat
```

Categorize by commit prefix:

- `feat:` commits = new user-facing functionality
- `fix:` commits = bug fixes
- `refactor:` / `chore:` commits = internal improvements

Group changes into these categories (skip empty ones):

1. **Feature highlights** — new user-facing functionality (describe what it does for the user, not the code)
2. **Bug fixes** — fixes to existing behavior
3. **Other improvements** — SEO, performance, refactoring, chore work

### Step 4: Determine Release Version

- Look at the latest tag (e.g., `v0.10.6`)
- Increment patch for bug fixes and minor improvements (e.g., `v0.10.7`)
- Increment minor for significant new features (e.g., `v0.11.0`)
- Use your judgment based on the scope of changes

### Step 5: Generate Release Text

Follow the **exact format** observed from recent releases. The format is:

```markdown
## What's Changed

### [Feature/Section Title]

[2-4 sentence description of the main feature, written for end users — what it does, how to use it]

### [Another Section if needed]

[Description]

### Bug Fixes / Other Improvements (if applicable)

- [Concise description of fix/improvement]
- [Another one]

### Code Changes

- [commit type]: [PR title] by @letehaha in [PR URL]
- [repeat for each PR]

**Full Changelog**: https://github.com/letehaha/budget-tracker/compare/<previous-tag>...<new-tag>
```

**Format rules:**

- Use `##` for the top "What's Changed" heading
- Use `###` for section titles within
- Feature descriptions should be user-facing (what changed for the user, not code details)
- If there's a single dominant feature, it can be the main section title (see v0.10.6 "Walutomat Integration" as reference)
- The "Code Changes" section lists all PRs with links
- Always end with the Full Changelog compare link
- Skip `chore:` commits from feature descriptions (but still list in Code Changes)

### Step 6: Suggest Release Title

Suggest a title following the pattern: `v<version> – <short description>`

Examples from past releases:

- `v0.10.6 – Walutomat integration`
- `v0.10.5 – "Balance Trend" spikes markers`
- `v0.10.4 - Stats on budget's details page`

### Step 7: Present to User

Output the release text as a markdown code block so the user can copy it directly. Also state the suggested release title separately.

**Do NOT create the release.** Only prepare the text and let the user decide when to publish.

## Examples

### Example 1: Feature-heavy release

User says: "prepare next release text"
Actions:

1. Find latest tag `v0.10.6`
2. Collect 6 PRs merged since then
3. Read commit messages: `feat: complete portfolio transfers`, `fix: balance trend calculation`, etc.
4. Identify portfolio transfers as main feature, several bug fixes
5. Generate formatted release text with feature description + bug fix list
   Result: Markdown release text + suggested title `v0.10.7 – Portfolio transfers & stats fixes`

### Example 2: Bug-fix-only release

User says: "create release notes"
Actions:

1. Find latest tag, collect changes
2. Read commit messages — all are `fix:` and `chore:` prefixed
3. No major features, only fixes
4. Use `[chore]` prefix in title, simpler format
   Result: Release text with bug fix list + suggested title `[chore] v0.10.8 – Bug fixes and improvements`

## Troubleshooting

### No commits found since last tag

Cause: HEAD is at the same commit as the latest tag
Solution: Inform the user there are no changes to release.

### `gh` command not found

Cause: GitHub CLI not installed
Solution: Ask user to install via `brew install gh`.
