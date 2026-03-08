---
name: spec-planner
description: Deep-dive specification planner. Interviews you thoroughly about new features, refactoring, or any work requiring planning. Use when you want to plan new functionality, refactor existing code, design architecture, or create detailed specifications. Triggers on "plan", "spec", "design", "architect", or when you mention wanting to think through implementation details.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, AskUserQuestion
---

# Spec Planner

An in-depth interviewing and specification writing skill that helps you think through features, refactoring, and architectural decisions before implementation.

## When to Use This Skill

Activate when user:

- Wants to plan a new feature or functionality
- Needs to refactor existing code and wants to think it through
- Says "plan", "let's plan", "help me plan", "spec out", "design"
- Wants to discuss implementation details before coding
- Mentions wanting to think through tradeoffs or concerns
- References a SPEC.md file or asks to create one

Do NOT activate for:

- Simple bug fixes that don't need planning
- Documentation requests (use prd-creator for PRDs)
- Direct code implementation requests without planning context

## Core Philosophy

**Interview First, Write Second**: Your primary job is to extract information from the user's head through thoughtful questioning. The spec document is a byproduct of thorough understanding.

**No Obvious Questions**: Never ask questions the user could answer by reading basic documentation. Focus on edge cases, tradeoffs, UX nuances, and non-obvious implementation concerns.

**Continuous Until Complete**: Keep interviewing until you've covered all aspects. Don't stop after one round of questions.

## Interview Process

### Phase 1: Context Gathering

1. If user references a file (like @SPEC.md or any existing spec), read it first
2. Explore relevant existing code to understand current architecture
3. Identify what the user is trying to achieve at a high level

### Phase 2: Deep-Dive Interviewing

Use `AskUserQuestion` tool repeatedly to probe deeply. Structure your questions across these dimensions:

Consult `references/interview-questions.md` for the full question bank. Cover these dimensions:

- **Technical Implementation**: Edge cases, failure conditions, async vs sync, rollback, validation, migrations, API contracts
- **UI/UX**: Loading states, error display, unexpected actions, confirmation dialogs, navigation, accessibility
- **Data & State**: Source of truth, staleness, caching, persistence, cascading deletes, consistency
- **Security & Privacy**: Access control, rate limiting, audit logging, sensitive data
- **Integration & Dependencies**: External services, failure handling, API limitations, feature interactions
- **Tradeoffs & Alternatives**: Approach justification, compromises, MVP scope, risk assessment
- **Future Considerations**: Evolution path, related features, changeability, extensibility vs simplicity

### Phase 3: Clarification Rounds

After initial deep-dive:

1. Summarize your understanding back to the user
2. Identify any contradictions or gaps
3. Ask follow-up questions based on their answers
4. Continue until you have no more ambiguities

### Phase 4: Spec Writing

Only after thorough interviewing, write the specification:

1. **Location**: Store specs in `docs/prds/` using kebab-case naming (e.g., `transaction-bulk-edit.md`)
2. **Structure**:
   - Overview (2-3 sentences max)
   - Problem Statement
   - Goals & Non-Goals (explicitly list what's OUT of scope)
   - Technical Design (architecture, data flow, key decisions)
   - Edge Cases & Error Handling
   - UI/UX Specifications (if applicable)
   - Security Considerations
   - Open Questions (anything still unresolved)
   - Implementation Notes (gotchas, dependencies, suggested order)

3. **Keep it Actionable**: Write for an engineer who needs to implement this. Be specific, not vague.

## Interview Rules

1. **Batch Questions Wisely**: Use AskUserQuestion to present 3-4 related questions at once, not one at a time (avoids fatigue) but not too many (avoids overwhelm).

2. **Build on Answers**: Each round of questions should be informed by previous answers. Don't use a generic checklist.

3. **Challenge Assumptions**: If the user says "it should just work like X", probe what "just work" means in edge cases.

4. **Suggest Alternatives**: When appropriate, present options with tradeoffs rather than just asking open-ended questions.

5. **Know When to Stop**: Stop interviewing when:
   - You can explain the feature back to them with full confidence
   - All edge cases have clear handling strategies
   - The user confirms the summary is accurate and complete

6. **Don't Assume**: Never fill in gaps with assumptions. If something is unclear, ask.

## Example Question Patterns

Instead of: "What should the button do?"
Ask: "When the user clicks submit and the network request fails mid-way, should we: (a) show an error and let them retry, (b) automatically retry N times silently, or (c) save as draft and notify them later?"

Instead of: "How should errors work?"
Ask: "If the external API returns a 429 rate limit error during bulk import of 100 items where 47 have already succeeded, should we: (a) fail the entire operation and rollback, (b) pause and retry after the rate limit window, or (c) mark partial success and let user resume?"

Instead of: "What's the UI?"
Ask: "When showing the list of 500+ items, should we: (a) paginate with explicit page numbers, (b) infinite scroll with virtualization, or (c) load-more button? Consider that users mentioned they often need to jump to specific items."

## Output Expectations

- The final spec should be detailed enough that another engineer could implement it without asking clarifying questions
- Include concrete examples where helpful
- List explicit decisions made during the interview
- Note any accepted limitations or future improvements deferred

## Examples

### Example 1: New feature spec

User says: "I want to plan a recurring transactions feature"
Actions:

1. Read existing transaction-related code for context
2. Interview user across all dimensions (3-4 rounds)
3. Write spec to `docs/prds/recurring-transactions.md`
   Result: Detailed spec covering technical design, edge cases, UI/UX, and implementation notes

### Example 2: Refactoring spec

User says: "Let's plan the migration from REST to tRPC"
Actions:

1. Explore current API structure and patterns
2. Interview about scope, rollout strategy, backwards compatibility
3. Write spec with phased migration plan
   Result: Actionable spec with clear phases, dependencies, and risk assessment

## Troubleshooting

### User gives vague answers

Cause: Questions are too open-ended or user hasn't thought through details yet
Solution: Offer concrete options with tradeoffs instead of open-ended questions. Use the "Instead of X, ask Y" patterns.

### Interview goes too long

Cause: Too many dimensions explored at once
Solution: Prioritize dimensions most relevant to the feature. Skip Security/Privacy for internal-only features, skip UI/UX for pure backend work.
