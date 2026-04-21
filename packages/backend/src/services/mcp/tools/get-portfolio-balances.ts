import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getPortfolioBalances } from '@services/investments/portfolios/balances';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetPortfolioBalances(server: McpServer) {
  server.registerTool(
    'get_portfolio_balances',
    {
      description:
        "Cash balances held in a portfolio, broken down per currency. Each entry includes totalCash and availableCash in the original currency plus their ref* equivalents converted to the user's base currency. Useful for answering 'how much cash do I have to invest'.",
      inputSchema: {
        portfolioId: z.number().describe('Portfolio ID (from get_portfolios)'),
        currencyCode: z
          .string()
          .optional()
          .describe('ISO 4217 currency code (e.g., "USD"). Omit to return balances in all currencies.'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_portfolio_balances', clientId: extra.authInfo?.clientId });

      const balances = await getPortfolioBalances({
        userId,
        portfolioId: args.portfolioId,
        currencyCode: args.currencyCode,
      });

      return jsonContent({ data: balances });
    },
  );
}
