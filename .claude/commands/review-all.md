Run a comprehensive review of the current branch changes by launching multiple specialized review agents in parallel.

## Steps

1. First, run `git diff main...HEAD --name-only` to get the list of changed files and determine whether frontend files (`packages/frontend/`) are affected.

2. Launch the following review agents **in parallel** using the Agent tool:
   - **pr-review-toolkit:code-simplifier** — review changed code for reuse, simplification opportunities, and unnecessary complexity
   - **pr-review-toolkit:code-reviewer** — review code for adherence to project guidelines, style, and best practices
   - **pr-review-toolkit:pr-test-analyzer** — analyze test coverage quality and completeness for the changes

3. If any frontend files were changed, also launch in the same parallel batch:
   - **Frontend rules compliance check** — read `.claude/skills/frontend-rules/SKILL.md`, then review all changed frontend files against those conventions and report violations. Use a general-purpose Agent for this.

4. After all agents complete, compile findings into a single organized report:
   - **Code Simplification** — findings from code-simplifier
   - **Code Quality** — findings from code-reviewer
   - **Test Coverage** — findings from pr-test-analyzer
   - **Frontend Rules Compliance** — findings from frontend check, or "N/A — no frontend changes"

   For each section, list actionable items. If a section has no issues, mark it as clean.
