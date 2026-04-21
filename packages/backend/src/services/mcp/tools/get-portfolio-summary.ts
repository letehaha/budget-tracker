import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getPortfolioSummary } from '@services/investments/portfolios/get-portfolio-summary.service';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetPortfolioSummary(server: McpServer) {
  server.registerTool(
    'get_portfolio_summary',
    {
      description:
        "Portfolio-level aggregates for a single portfolio: total current market value, total cost basis, realized and unrealized gains (value and percent), cash balances, and total portfolio value (holdings + cash). All monetary values are decimals in the user's base currency.",
      inputSchema: {
        portfolioId: z.number().describe('Portfolio ID (from get_portfolios)'),
        date: z
          .string()
          .optional()
          .describe('Date for historical snapshot (ISO 8601). Default: latest available prices'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_portfolio_summary', clientId: extra.authInfo?.clientId });

      const summary = await getPortfolioSummary({
        userId,
        portfolioId: args.portfolioId,
        date: args.date ? new Date(args.date) : undefined,
      });

      return jsonContent({ data: summary });
    },
  );
}
