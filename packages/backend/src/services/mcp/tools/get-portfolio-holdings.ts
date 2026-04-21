import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getHoldings } from '@services/investments/holdings/get-holdings.service';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetPortfolioHoldings(server: McpServer) {
  server.registerTool(
    'get_portfolio_holdings',
    {
      description:
        'Positions held in a portfolio with dynamically calculated market value, cost basis, and realized/unrealized gain (value and percent). Each holding includes the embedded security (symbol, name, asset class, currency). Filter by securityId to look at a single position.',
      inputSchema: {
        portfolioId: z.number().describe('Portfolio ID (from get_portfolios)'),
        securityId: z.number().optional().describe('Filter to a specific security'),
        date: z
          .string()
          .optional()
          .describe('Date for historical valuation (ISO 8601). Default: latest available prices'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_portfolio_holdings', clientId: extra.authInfo?.clientId });

      const holdings = await getHoldings({
        userId,
        portfolioId: args.portfolioId,
        securityId: args.securityId,
        date: args.date ? new Date(args.date) : undefined,
      });

      return jsonContent({ data: holdings });
    },
  );
}
