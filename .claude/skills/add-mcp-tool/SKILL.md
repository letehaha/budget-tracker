---
name: add-mcp-tool
description: Add a new tool to the MoneyMatter MCP server. Auto-triggers when the user asks to "add MCP tool", "new MCP tool", "expose X via MCP", or when exposing any existing backend service to MCP clients. Handles every metafile the drift tests check.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Add MCP Tool

Adds a new tool to the MCP server at `https://mcp.moneymatter.app/mcp` without breaking any drift check.

## When to use

- User asks to add/expose a new MCP tool
- User wants an existing backend service callable by MCP clients (Claude Desktop, ChatGPT, etc.)
- Any time the tool list at `packages/frontend/public/.well-known/mcp/server-card.json` needs to grow

## Architecture at a glance

Each MCP tool is a thin wrapper over an existing backend service:

```
Service (@services/...)
  ↓ called by
MCP tool file (packages/backend/src/services/mcp/tools/<name>.ts)
  ↓ registered in
createMcpServer() (packages/backend/src/services/mcp/server.ts)
```

Three metafiles stay in sync via drift tests:

- `packages/frontend/public/.well-known/mcp/server-card.json` — machine-readable tool list
- `packages/frontend/public/skills/connect-moneymatter/SKILL.md` — human-readable agent skill
- `packages/frontend/public/.well-known/agent-skills/index.json` — contains `sha256` of the SKILL.md above

## Checklist (complete every step)

When adding tool `my_new_tool`:

### 1. Create the tool file

Path: `packages/backend/src/services/mcp/tools/my-new-tool.ts` (kebab-case filename)

Use this template verbatim. Adjust imports, tool name, description, `inputSchema`, service call, and `tool:` string in `trackMcpToolUsed`.

```typescript
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { myService } from '@services/path/to/my-service';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerMyNewTool(server: McpServer) {
  server.registerTool(
    'my_new_tool',
    {
      description: 'What it returns and when an agent should call it. One sentence plus a hint on key fields.',
      inputSchema: {
        someId: z.number().describe('...'),
        optionalFilter: z.string().optional().describe('...'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'my_new_tool', clientId: extra.authInfo?.clientId });

      const result = await myService({ userId, ...args });
      return jsonContent({ data: result });
    },
  );
}
```

Rules:

- Tool name is **snake_case** (matches MCP convention) and must exactly equal the string in `server-card.json`.
- Register function is `register<PascalCase>`. File is `<kebab-case>.ts`.
- `inputSchema` is a **plain object of Zod schemas** (no outer `z.object(...)`).
- For tools with no inputs: omit `inputSchema` and drop the `args` parameter — handler becomes `async (extra) => {...}`.
- Always call `getUserId({ extra })` first — it enforces auth and returns `userId`.
- Always call `trackMcpToolUsed({ userId, tool, clientId: extra.authInfo?.clientId })` immediately after.
- Wrap the final response in `jsonContent({ data })`. Money instances auto-serialize to decimals via `toJSON()` in `JSON.stringify`.
- Use `z.enum([...])` for enum args — match the style in `search-transactions.ts`.
- Dates: pass ISO strings in and convert with `new Date(args.date)` if the underlying service expects a `Date`.

### 2. Register the tool in `server.ts`

Add the import (alphabetical) and call it inside `createMcpServer()`:

```typescript
import { registerMyNewTool } from './tools/my-new-tool';
// ...
registerMyNewTool(server);
```

### 3. Update `server-card.json`

Path: `packages/frontend/public/.well-known/mcp/server-card.json`

Append to the `tools[]` array:

```json
{
  "name": "my_new_tool",
  "description": "Short third-person description. Match what clients see."
}
```

The `name` MUST match the string in step 1 exactly. The drift test compares sorted arrays by string equality.

### 4. Update the connect-moneymatter SKILL.md

Path: `packages/frontend/public/skills/connect-moneymatter/SKILL.md`

Add a row to the "Available tools" table under the correct conceptual group (accounts vs investments vs analytics vs categories/tags). Use the SAME column layout (keep table alignment padded).

If the new tool introduces a new data convention (e.g. investments vs regular transactions), also add a bullet under "Data conventions".

### 5. Recompute SKILL.md sha256

```bash
shasum -a 256 packages/frontend/public/skills/connect-moneymatter/SKILL.md
```

Take the hex digest and update it in `packages/frontend/public/.well-known/agent-skills/index.json`:

```json
{
  "skills": [
    {
      "name": "connect-moneymatter",
      ...
      "sha256": "<paste digest here>"
    }
  ]
}
```

Forgetting this step breaks `agent-skills-drift.unit.ts`.

### 6. Verify drift tests pass

```bash
cd packages/backend
npm run test:unit -- --testPathPattern='mcp/(server-card-drift|agent-skills-drift)'
```

Expect 7 passing assertions across 2 suites. If any fail:

- **`tools array` mismatch** → name in source and `server-card.json` don't match. Check for typos.
- **`every tool has a non-empty description`** → description missing in `server-card.json`.
- **`sha256 matches`** → re-run `shasum -a 256` and paste again.
- **`every skill URL resolves`** → `SKILL.md` file path is wrong.

Delegate to the `test-runner` subagent (per CLAUDE.md rules).

### 7. Lint check (optional but cheap)

Delegate to the `linter` subagent. Existing MCP tool files may show 4 `TS1005`-style errors from an `ioredis` env issue — that's pre-existing noise and not caused by new tools. Real errors look different (unused imports, mistyped service args, wrong Zod shape).

## Anti-patterns

- **Do not** bypass `getUserId` or skip `trackMcpToolUsed`. These are enforced across all existing tools.
- **Do not** call services with `raw: true` or reach past the service layer. Use the `@services/*` function as-is.
- **Do not** add custom auth logic — all auth flows through the OAuth bearer token resolved by `extra.authInfo`.
- **Do not** version-bump `serverInfo.version` unless the change is breaking (removing/renaming a tool, removing a field). Adding a new tool is additive and needs no version bump. The drift test compares `serverInfo.version` to the version constant in `server.ts` — keep them identical either way.
- **Do not** add e2e tests for individual tools. Coverage is via drift tests + the shared `connected-apps.e2e.ts`.

## Reference examples

Representative tools to copy from:

- **No args**: `tools/get-user-profile.ts`
- **Single filter + pagination**: `tools/get-accounts.ts`
- **Many optional filters + pagination + enum**: `tools/search-transactions.ts`
- **Conditional branch based on args**: `tools/get-balance-history.ts`

Helpers available from `./helpers`:

- `getUserId({ extra })` — throws if unauthenticated
- `jsonContent({ data })` — wraps in MCP content envelope
- `parseScopes({ scopes })` — only useful in auth-adjacent code, not individual tools

Analytics: `trackMcpToolUsed` lives at `@js/utils/posthog`. It's a no-op outside production.
