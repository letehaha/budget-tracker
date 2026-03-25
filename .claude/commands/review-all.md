Run a comprehensive, deduplicated review of the current branch changes using an agent team where reviewers communicate to avoid overlapping findings.

## Steps

### 1. Gather context

Run `git diff main...HEAD --name-only` to get the list of changed files. Determine:

- Whether frontend files (`packages/frontend/`) are affected
- Whether backend files (`packages/backend/`) are affected
- Store the full file list — you'll pass it to each teammate's prompt

### 2. Create the review team

Use `TeamCreate` with `team_name: "review"`.

### 3. Create tasks

Create one task per reviewer using `TaskCreate`. Each task should include the changed file list in its description.

### 4. Spawn teammates

Spawn the following teammates using the `Agent` tool with `team_name: "review"`. Each teammate gets the **full changed file list** in its prompt plus the collaboration instructions below.

**Always spawn:**

| Name                    | subagent_type                             | Role                                                                     |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `code-simplifier`       | `pr-review-toolkit:code-simplifier`       | Reuse opportunities, unnecessary complexity, dead code                   |
| `code-reviewer`         | `pr-review-toolkit:code-reviewer`         | Project guidelines, style, best practices, naming, architecture          |
| `test-analyzer`         | `pr-review-toolkit:pr-test-analyzer`      | Test coverage quality, missing tests, edge cases                         |
| `silent-failure-hunter` | `pr-review-toolkit:silent-failure-hunter` | Silent failures, swallowed errors, bad fallbacks, missing error handling |
| `type-analyzer`         | `pr-review-toolkit:type-design-analyzer`  | Type design quality, encapsulation, invariant expression                 |

**Conditionally spawn (only if frontend files changed):**

| Name               | subagent_type     | Role                                                                                                                                              |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-checker` | `general-purpose` | Frontend conventions compliance — read `.claude/skills/frontend-rules/SKILL.md`, then review all changed frontend files against those conventions |

### 5. Collaboration instructions for each teammate

Include these instructions in **every** teammate's prompt:

```
## Collaboration Protocol

You are part of a review team. Other reviewers are looking at the same changes from different angles. To produce a clean, non-overlapping report:

1. **Do your review first.** Complete your full review before communicating.
2. **Share your findings.** After finishing, send a summary of your findings to ALL other teammates using SendMessage. Keep it concise — just the file, line, and one-line description per finding.
3. **Read other reviewers' findings.** When you receive findings from other teammates, check for overlap with yours.
4. **Deduplicate.** If another reviewer already reported something you found, remove it from your list and note that it's covered by them. If you have a different angle on the same issue, keep yours but reference theirs.
5. **Send your final report to the lead.** After deduplication, send your final findings to the lead (use SendMessage with `to: "lead"`). Format:

   ### [Your Role Name]
   - Each finding as: `**file:line** — description`
   - If no issues found: "No issues found."
   - If items were deduplicated: note "N items deferred to [other-reviewer]"
```

### 6. Assign tasks

Use `TaskUpdate` to assign each task to the corresponding teammate.

### 7. Wait for completion

Wait for all teammates to send their final deduplicated reports. Messages arrive automatically — do not poll.

### 8. Compile final report

Once all teammates have reported, compile into a single organized report:

- **Code Simplification** — from code-simplifier
- **Code Quality** — from code-reviewer
- **Test Coverage** — from test-analyzer
- **Silent Failures** — from silent-failure-hunter
- **Type Design** — from type-analyzer
- **Frontend Rules Compliance** — from frontend-checker, or "N/A — no frontend changes"

For each section, list actionable items grouped by file. If a section has no issues, mark it as clean. At the end, add a **Summary** with total issue count per category.

### 9. Shutdown

Send `{type: "shutdown_request"}` to all teammates via SendMessage.
