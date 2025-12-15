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
