# Connect an AI agent to MoneyMatter

MoneyMatter exposes a remote Model Context Protocol (MCP) server. Connecting an
agent to this server gives the agent read-only, OAuth-secured access to the
user's financial data (accounts, transactions, budgets, categories, tags,
cash flow, balance history).

Use this skill when the user asks to "connect Claude to my budget", "hook up
ChatGPT to MoneyMatter", "let my AI see my finances", or similar.

## Endpoints

- **MCP transport**: `https://mcp.moneymatter.app/mcp` (Streamable HTTP)
- **Server card**: <https://moneymatter.app/.well-known/mcp/server-card.json>
- **OAuth Authorization Server metadata**: <https://moneymatter.app/.well-known/oauth-authorization-server>
- **OAuth Protected Resource metadata**: <https://moneymatter.app/.well-known/oauth-protected-resource>

## Required OAuth scopes

| Scope            | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `finance:read`   | Read accounts, transactions, budgets, and analytics    |
| `profile:read`   | Read the user's profile (name, email, base currency)   |
| `offline_access` | Receive a refresh token so sessions survive expiration |

MCP access is **read-only** — no scope exists for writes. Users can revoke a
connected app at any time from the MoneyMatter settings page.

## Setup steps (Claude Desktop, Claude.ai, ChatGPT, OpenClaw)

1. Ensure the user has a MoneyMatter account. If not: direct them to
   <https://moneymatter.app/sign-up>.
2. In the agent client, add a new MCP server using the URL
   `https://mcp.moneymatter.app/mcp`.
3. The client discovers the OAuth authorization server from the
   `/.well-known/oauth-protected-resource/mcp` endpoint automatically.
4. The client opens a browser window for the user to sign in and authorize
   the requested scopes. The user grants consent in the MoneyMatter UI.
5. On success, the agent receives tokens and can list the tools exposed by
   the server (see below).

## Available tools

| Tool                         | Purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| `get_user_profile`           | Base currency, configured currencies, profile basics     |
| `get_accounts`               | List accounts with balances, types, currencies           |
| `search_transactions`        | Filter transactions by date, category, tag, amount, etc. |
| `get_categories`             | List spending/income categories                          |
| `get_tags`                   | List transaction tags                                    |
| `get_budgets`                | Budgets with progress and overspend state                |
| `get_spending_by_categories` | Aggregate spending by category over a range              |
| `get_cash_flow`              | Income vs expenses over a range                          |
| `get_balance_history`        | Time-series of account balances                          |
| `get_expenses_for_period`    | Expenses summary for a time period                       |

Call `get_user_profile` **first** — it reveals the user's base currency, which
is required to interpret `ref*` fields (refAmount, refBalance) that normalize
multi-currency data.

## Data conventions

- All monetary amounts are decimals (e.g. `42.50` means $42.50), not cents.
- Fields prefixed with `ref` are converted to the user's base currency.
  Use them for cross-account totals when accounts have different currencies.
- Transaction types: `income`, `expense`, `transfer`. Transfers are **not**
  income or expense — exclude them from spend/earn aggregations.

## Troubleshooting

- **OAuth consent screen doesn't appear**: confirm the client fetched
  `/.well-known/oauth-authorization-server` and is using the advertised
  `authorization_endpoint`.
- **401 Unauthorized on tool calls**: the access token expired. The client
  should use the refresh token (granted via `offline_access` scope) to obtain
  a new access token.
- **Revoking access**: user goes to MoneyMatter → Settings → AI Integrations
  and removes the connected app.

## Self-hosted deployments

Users who self-host will have their own MCP URL (e.g. `https://mcp.my-domain.tld/mcp`).
Ask the user for their deployment URL before assuming the public endpoint.
