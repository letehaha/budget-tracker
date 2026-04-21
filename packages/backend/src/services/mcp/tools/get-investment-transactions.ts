import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTransactions } from '@services/investments/transactions/get.service';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetInvestmentTransactions(server: McpServer) {
  server.registerTool(
    'get_investment_transactions',
    {
      description:
        'Investment transaction history: buy, sell, dividend, transfer, tax, fee, cancel, other. Each transaction includes amount, quantity, price, fees, date, category, and the embedded security. Distinct from search_transactions, which covers regular (non-investment) spending. Default: 20 most recent across all portfolios.',
      inputSchema: {
        portfolioId: z.number().optional().describe('Restrict to a specific portfolio'),
        securityId: z.number().optional().describe('Restrict to a specific security'),
        category: z
          .enum([
            INVESTMENT_TRANSACTION_CATEGORY.buy,
            INVESTMENT_TRANSACTION_CATEGORY.sell,
            INVESTMENT_TRANSACTION_CATEGORY.dividend,
            INVESTMENT_TRANSACTION_CATEGORY.transfer,
            INVESTMENT_TRANSACTION_CATEGORY.tax,
            INVESTMENT_TRANSACTION_CATEGORY.fee,
            INVESTMENT_TRANSACTION_CATEGORY.cancel,
            INVESTMENT_TRANSACTION_CATEGORY.other,
          ])
          .optional()
          .describe('Filter by transaction category'),
        startDate: z.string().optional().describe('Start date (ISO 8601)'),
        endDate: z.string().optional().describe('End date (ISO 8601)'),
        limit: z.number().optional().describe('Max results (default: 20)'),
        offset: z.number().optional().describe('Pagination offset (default: 0)'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_investment_transactions', clientId: extra.authInfo?.clientId });

      const result = await getTransactions({
        userId,
        portfolioId: args.portfolioId,
        securityId: args.securityId,
        category: args.category as INVESTMENT_TRANSACTION_CATEGORY | undefined,
        startDate: args.startDate,
        endDate: args.endDate,
        limit: args.limit,
        offset: args.offset,
      });

      return jsonContent({ data: result });
    },
  );
}
