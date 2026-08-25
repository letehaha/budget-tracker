import { dateString, recordId } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listPortfolioTransfers } from '@services/investments/portfolios/transfers';
import { z } from 'zod';

import { slimPortfolioTransferForMcp } from '../serializers';
import { getUserId, jsonContent } from './helpers';

const inputSchema = {
  portfolioId: recordId().describe('Portfolio ID (from get_portfolios)'),
  from: dateString().optional().describe('Only transfers on or after this date (YYYY-MM-DD)'),
  to: dateString().optional().describe('Only transfers on or before this date (YYYY-MM-DD)'),
  limit: z.number().int().positive().max(100).optional().describe('Max results to return (default: 20)'),
  offset: z.number().int().min(0).optional().describe('Pagination offset (default: 0)'),
};

export function registerListPortfolioTransfers(server: McpServer) {
  server.registerTool(
    'list_portfolio_transfers',
    {
      description:
        'Cash movement history of a portfolio: account↔portfolio transfers, direct deposits/withdrawals, linked bank transactions, and currency exchanges. Each entry names the source/destination portfolio or account. Sorted by date, newest first. Returns { transfers, totalCount }.',
      inputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'list_portfolio_transfers', clientId: extra.authInfo?.clientId });

      const { data, totalCount } = await listPortfolioTransfers({
        userId,
        portfolioId: args.portfolioId,
        from: args.from,
        to: args.to,
        limit: args.limit,
        offset: args.offset,
      });

      return jsonContent({ data: { transfers: data.map(slimPortfolioTransferForMcp), totalCount } });
    },
  );
}
