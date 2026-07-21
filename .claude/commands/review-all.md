Run a comprehensive review of the current branch changes by spawning multiple reviewers in parallel.

## Steps

### 1. Gather context

**Base branch:** default to `dev` (the integration branch), never `main`. If the user specified a different base branch in their invocation, use that instead. Everywhere below, `<base>` refers to this resolved branch.

Get the list of changed files on the current branch, covering **both committed and uncommitted** work:

- Committed changes since the branch diverged: `git diff <base>...HEAD --name-only`
- Uncommitted work (staged + unstaged + untracked): `git status --short`

When the branch sits on the current `<base>` tip, `git diff <base> --name-only` captures committed + staged + unstaged in one diff; add untracked new files from `git status`. But if `<base>` has advanced past the branch's merge-base, that two-dot diff pulls in unrelated base-only changes — diff against the merge-base instead: `git diff $(git merge-base <base> HEAD) --name-only`. Build the review diff from this combined set.

Determine:

- Whether frontend files (`packages/frontend/`) are affected
- Whether backend files (`packages/backend/`) are affected
- Store the full file list — you'll pass it to each reviewer's prompt

### 2. Spawn reviewers in parallel

Spawn the following reviewers using the `Agent` tool **in a single message with multiple tool calls** so they run concurrently. Each reviewer gets the **full changed file list** in its prompt.

**Always spawn:**

| Name                    | subagent_type                             | Role                                                                                                                      |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `code-simplifier`       | `pr-review-toolkit:code-simplifier`       | Reuse opportunities, unnecessary complexity, dead code                                                                    |
| `code-reviewer`         | `pr-review-toolkit:code-reviewer`         | Project guidelines, style, best practices, naming, architecture                                                           |
| `test-analyzer`         | `pr-review-toolkit:pr-test-analyzer`      | Test coverage quality, missing tests, edge cases                                                                          |
| `silent-failure-hunter` | `pr-review-toolkit:silent-failure-hunter` | Silent failures, swallowed errors, bad fallbacks, missing error handling                                                  |
| `type-analyzer`         | `pr-review-toolkit:type-design-analyzer`  | Type design quality, encapsulation, invariant expression                                                                  |
| `architecture-analyzer` | `general-purpose`                         | Architecture deepening opportunities — invoke the `improve-codebase-architecture` skill and apply it to the changed files |

**Note for `architecture-analyzer`:** its prompt must explicitly instruct it to invoke the `improve-codebase-architecture` skill via the `Skill` tool first, then scope the resulting analysis to the changed files only (not the whole codebase). Findings should focus on architectural deepening opportunities introduced or worsened by the diff.

**Conditionally spawn (only if frontend files changed):**

| Name               | subagent_type     | Role                                                                                                                                              |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-checker` | `general-purpose` | Frontend conventions compliance — read `.claude/skills/frontend-rules/SKILL.md`, then review all changed frontend files against those conventions |

Each reviewer's prompt should ask for findings in this format:

```
- **file:line** — description
```

If no issues found, the reviewer should report "No issues found."

### 3. Compile final report

Once all reviewers have returned, compile into a single organized report:

- **Code Simplification** — from code-simplifier
- **Code Quality** — from code-reviewer
- **Test Coverage** — from test-analyzer
- **Silent Failures** — from silent-failure-hunter
- **Type Design** — from type-analyzer
- **Architecture** — from architecture-analyzer
- **Frontend Rules Compliance** — from frontend-checker, or "N/A — no frontend changes"

For each section, list actionable items grouped by file. If a section has no issues, mark it as clean. At the end, add a **Summary** with total issue count per category. Note that since reviewers ran independently, some findings may overlap across sections — call out duplicates in the summary.
