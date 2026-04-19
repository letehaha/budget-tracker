# MoneyMatter — Free Open-Source Budget Tracker & Personal Finance App

> Free, open-source budget tracking app. Connect your banks, track expenses, set budgets, and monitor investments. Self-host for full control or use our cloud — your data stays yours.

MoneyMatter is a privacy-first alternative to apps like Mint and YNAB. It is free, open-source (CC BY-NC-SA 4.0), and designed for people who want control over their financial data.

## Why MoneyMatter

- **Your finances. Your server. Zero data harvesting.**
- Free and open source
- Self-host or use our cloud — either way, your data is never sold or shared
- Shape the roadmap with your feedback (early adopter perk)

## Features

- Bank account synchronization (Monobank, EnableBanking, LunchFlow, more coming)
- AI-powered transaction categorization that learns your spending patterns
- Budget tracking with visual progress indicators
- Investment portfolio tracking with real-time market data
- Multi-currency support with automatic exchange rates
- CSV and bank statement import (with AI-assisted parsing)
- Custom categories, tags, and notes for transactions
- Recurring transaction tracking
- Detailed analytics and spending reports
- Full data export
- Dark mode, mobile-friendly responsive design
- PWA (Progressive Web App) support

## AI Integration (MCP)

MoneyMatter exposes a remote MCP (Model Context Protocol) server that gives AI assistants read-only, OAuth-secured access to your financial data. Ask natural-language questions like:

- "Compare my dining out this month to my 3-month average"
- "Which subscriptions have increased in the past 6 months?"
- "I want to save $500/month — where can I realistically cut?"

Works with Claude, ChatGPT, OpenClaw, and any MCP-compatible client. Access can be revoked anytime.

- MCP endpoint: `https://mcp.moneymatter.app/mcp`
- MCP server card: [/.well-known/mcp/server-card.json](https://moneymatter.app/.well-known/mcp/server-card.json)
- OAuth discovery: [/.well-known/oauth-authorization-server](https://moneymatter.app/.well-known/oauth-authorization-server)

## Deployment Options

- **Cloud**: Sign up at <https://moneymatter.app> — no setup required, data never sold.
- **Self-hosted**: Deploy with Docker on your own server for maximum privacy. Source code and setup guide at <https://github.com/letehaha/budget-tracker>.

## Links

- [Sign up / Get started](https://moneymatter.app/sign-up)
- [GitHub repository](https://github.com/letehaha/budget-tracker)
- [API catalog](https://moneymatter.app/.well-known/api-catalog)
- [Privacy policy](https://moneymatter.app/privacy-policy)
- [Terms of use](https://moneymatter.app/terms-of-use)
- [llms.txt](https://moneymatter.app/llms.txt) · [llms-full.txt](https://moneymatter.app/llms-full.txt)

## License

MoneyMatter is released under CC BY-NC-SA 4.0. Source: <https://github.com/letehaha/budget-tracker>.
