# Project Rules & Conventions

## Context Files

- **Backend work**: Read `.claude/docs/backend-conventions.md` before writing backend code
- **Frontend work**: Read `.claude/docs/frontend-conventions.md` before writing frontend code

## Testing Patterns

**CRITICAL**: E2E tests in this project NEVER call services directly. They ONLY make HTTP endpoint calls through the test helpers.

Examples:

- ❌ WRONG: `await syncHistoricalPrices(securityId)`
- ✅ CORRECT: `await helpers.createHolding({ payload: { portfolioId, securityId } })` (which triggers sync internally)
- ❌ WRONG: `await someService.doSomething()`
- ✅ CORRECT: `await helpers.makeRequestToEndpoint()`

Always test through the actual API endpoints to ensure full integration testing.

**CRITICAL: E2E Tests Required for New Backend Endpoints**

- Every new backend endpoint (route + controller + service) **MUST** include an e2e test before the work is considered complete.
- **Auto-trigger**: After implementing a new endpoint, automatically write e2e tests as the next step — don't wait to be asked.
- Minimum coverage: **happy path**, **empty state**, and at least one **error case**.
- Follow the `e2e-test-creator` skill conventions (`.claude/skills/e2e-test-creator/SKILL.md`) for structure and patterns.
- Suggest running the tests to the user, but wait for confirmation before executing.

**Bug Fix Workflow: Test-First Approach**

- When a bug is reported, do **NOT** start by trying to fix it.
- **First**, write a test that reproduces the bug (the test should fail) if it's suitable. For backend use e2e tests, for frontend if it's a util/composable write unit-test.
- **Then**, use subagents to fix the bug and prove it with a passing test.

**CRITICAL: Running Tests**

- **Do NOT run tests automatically** unless the user explicitly requests it. Tests can be slow and expensive (Docker containers, database setup). You can suggest running tests, but wait for user confirmation.
- **NEVER** use `npx jest` directly. Always use the npm scripts.
- **ALWAYS** use the `test-runner` subagent to run tests. The main agent must NEVER run tests directly.
- Backend e2e tests: `npm run test:e2e` from `packages/backend/`
- To run a specific test file: `npm run test:e2e -- --testPathPattern='<pattern>'`
- Example: `npm run test:e2e -- --testPathPattern='subscriptions/subscriptions.e2e'`
- **NEVER** run e2e tests in parallel (no concurrent test-runner agents for e2e). The Docker-based test environment does not support parallel runs. To test multiple files, combine them in a single `--testPathPattern` regex.
- Example (multiple files): `npm run test:e2e -- --testPathPattern='subscriptions/(subscriptions|matching-disambiguation).e2e'`

Other instructions:

1. File names should always be in kebab-case
2. All functions should _always_ use object-like params.
   - Never: function(arg1, arg2, arg3)
   - Always: function({ arg1, arg2, arg3 })
3. When planning the implementation don't limit yourself to 3-4 questions and 1 round.
   Ask as many questions with as many rounds as needed to collect all important information
4. Use this map of suagents for different tasks:
   - running any unit or e2e tests – use test-runner
   - running any linter – use linter
     – planning doing any websearch – use websearch
     – if asked to do any code review – use code-change-reviewer
5. **Tool Selection for Code Search:**

   **Use ast-grep when:**

   - Finding code patterns by **structure** (not just text):
     - Function calls with specific argument patterns
     - Class/interface definitions matching criteria
     - Conditionals without certain clauses (e.g., `if` without `else`)
   - **i18n migrations**: Distinguishing user-facing text from technical strings
     - Finds `<h1>Welcome</h1>` (needs i18n) vs `console.log('debug')` (doesn't)
     - Locates strings not wrapped in `$t()` or `t()`
   - **Refactoring**: Renaming/restructuring based on syntax tree
   - **Context-aware searches**: Code in specific syntactic positions

   **Use grep when:**

   - Simple literal searches (variable names, specific constants)
   - Cross-file-type searches (markdown, JSON, configs, code)
   - Exploratory searches (don't know exact structure yet)
   - Finding comments, documentation, string literals

   **Examples:**

   ```bash
   # ❌ Use ast-grep instead
   grep -r "useState" --include="*.tsx"  # Finds in comments, strings

   # ✅ Use ast-grep for structural search
   ast-grep --pattern 'useState($$$)' src/**/*.tsx

   # ✅ Use grep for simple search
   grep -r "API_ENDPOINT" --include="*.ts"

   # ✅ Use ast-grep for i18n
   ast-grep --pattern '<button>$TEXT</button>' src/**/*.vue
   ```

6. **Money Convention: Cents in DB, Decimals in API, Decimals in Frontend**
   - The database stores all monetary amounts in **cents** (integers)
   - All API responses MUST return monetary amounts as **decimals** (not cents)
     For example:
     - When returning transaction data: use `serializeTransactions()` / `serializeTransaction()` from `@root/serializers/transactions.serializer`
     - When serializing manually (e.g. from BelongsToMany includes): convert each money field with `toDecimal(asCents(value))` from `@bt/shared/types`
     - Money fields on transactions: `amount`, `refAmount`, `commissionRate`, `refCommissionRate`, `cashbackAmount`
   - **Frontend ALWAYS works with decimals.** The API returns decimals, forms accept decimals, and the frontend sends decimals back. **NEVER** manually convert between cents and decimals in frontend code. The only cents↔decimal conversion happens in the backend serializers/deserializers.
7. **i18n Files - DO NOT EDIT UNLESS EXPLICITLY ASKED**
   - i18n locale files are BLOCKED from reading (hook saves tokens)
   - **NEVER** proactively add/update translations when implementing features
   - **ONLY** edit i18n files when the user explicitly asks for translation work
   - When asked, use the `i18n-editor` subagent
   - If a feature needs translations, mention it in your response and let the user decide when to add them
8. For Chrome extenstion use Brave browser, not Chrome
9. **Frontend env vars (`VITE_*`) must also be added to CI** — they are inlined at build time. Add as input + envkey in `.github/actions/frontend-docker-build/action.yml`, then pass the secret in `.github/workflows/image-to-docker-hub.yml`.
10. **VERY IMPORTANT: Stop Early When Stuck**
    - If something doesn't work as expected during implementation, you are allowed **1–2 attempts** to fix it.
    - After that — **STOP**. Do NOT keep trying workarounds, custom scripts, eval hacks, or speculative fixes.
    - Instead, **describe the problem to the user** and ask what to do next.
    - This applies to debugging, unexpected behavior, failing builds, type errors you can't resolve, etc.
    - Burning tokens on a long chain of guesses almost never helps. Asking the user is always better.
