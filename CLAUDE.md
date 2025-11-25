# Project Rules & Conventions

**CRITICAL**: Claude Code MUST follow all project rules defined in `.cursor/rules/*` files:

- **Rule Files Location:** `.cursor/rules/` directory
- **Rule Format:** All `.mdc` files in this directory contain mandatory project rules
- **Priority:** These rules take precedence over default Claude Code behavior
- **Scope:** Apply to ALL code-related work including Task Master workflows

**Key Rule Files:**

- `cursor_rules.mdc` - Core project conventions and coding standards
- `self_improve.mdc` - Pattern recognition and improvement guidelines
- Any additional `.mdc` files in the rules directory

**Implementation:**

1. **Before any code work:** Read ALL `.mdc` files in `.cursor/rules/`
2. **During development:** Follow these rules alongside Task Master workflows
3. **Code review:** Ensure all changes comply with project rules
4. **Consistency:** Apply rules across all files and features uniformly

**Note:** Project rules in `.cursor/rules/*` are not suggestions - they are mandatory coding standards for this codebase.

## Additional Claude Code Instructions

Claude Code should also follow project-specific instructions from:

- **Gemini CLI Guidelines:** [.claude/gemini.md](mdc:.claude/gemini.md) - Instructions for using Gemini CLI for token-efficient codebase analysis
  - **PRIMARY RULE: Use `gemini -p "@path/to/files"` for ANY multi-file analysis to save Claude tokens**
  - **RULE OF THUMB: If you're about to read 2+ files to understand something, use Gemini first**
  - Leverage Gemini's 2M token context window for comprehensive project analysis
  - Follow the file inclusion syntax and best practices outlined in the guide

**Critical Note:** Token efficiency is the primary reason to use Gemini CLI. Use it for code exploration, architecture understanding, feature verification, and any task involving multiple files - regardless of file size. This significantly reduces Claude token usage and costs.

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
