# Project Rules & Conventions

**CRITICAL**: Claude Code MUST follow all project rules defined in `.cursor/rules/*` files:

- **Rule Files Location:** `.cursor/rules/` directory
- **Rule Format:** All `.mdc` files in this directory contain mandatory project rules
- **Priority:** These rules take precedence over default Claude Code behavior
- **Scope:** Apply to ALL code-related work

**Key Rule Files:**

- `cursor_rules.mdc` - Core project conventions and coding standards
- `self_improve.mdc` - Pattern recognition and improvement guidelines
- Any additional `.mdc` files in the rules directory

**Implementation:**

1. **Before any code work:** Read ALL `.mdc` files in `.cursor/rules/`
2. **During development:** Follow these rules consistently
3. **Code review:** Ensure all changes comply with project rules
4. **Consistency:** Apply rules across all files and features uniformly

**Note:** Project rules in `.cursor/rules/*` are not suggestions - they are mandatory coding standards for this codebase.

## Testing Patterns

**CRITICAL**: E2E tests in this project NEVER call services directly. They ONLY make HTTP endpoint calls through the test helpers.

Examples:

- ❌ WRONG: `await syncHistoricalPrices(securityId)`
- ✅ CORRECT: `await helpers.createHolding({ payload: { portfolioId, securityId } })` (which triggers sync internally)
- ❌ WRONG: `await someService.doSomething()`
- ✅ CORRECT: `await helpers.makeRequestToEndpoint()`

Always test through the actual API endpoints to ensure full integration testing.

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
