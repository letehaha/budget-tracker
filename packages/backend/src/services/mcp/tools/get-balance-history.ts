import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { serializeBalanceHistory, serializeCombinedBalanceHistory } from '@root/serializers/stats.serializer';
import { getBalanceHistoryForAccount } from '@services/stats/get-balance-history-for-account';
import { getCombinedBalanceHistory } from '@services/stats/get-combined-balance-history';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetBalanceHistory(server: McpServer) {
  server.tool(
    'get_balance_history',
    'Get account balance over time. If accountId is provided, returns balance history for that specific account. Otherwise, returns combined balance across all accounts.',
    {
      startDate: z.string().optional().describe('Start date (ISO 8601). Default: 30 days ago'),
      endDate: z.string().optional().describe('End date (ISO 8601). Default: today'),
      accountId: z.number().optional().describe('Specific account ID. Omit for combined balance across all accounts.'),
    },
    async (args, extra) => {
      const userId = getUserId({ extra });

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const from = args.startDate ?? thirtyDaysAgo.toISOString();
      const to = args.endDate ?? now.toISOString();

      if (args.accountId) {
        const balances = await getBalanceHistoryForAccount({
          userId,
          accountId: args.accountId,
          from,
          to,
        });
        return jsonContent({ data: serializeBalanceHistory(balances) });
      }

      const combined = await getCombinedBalanceHistory({ userId, from, to });
      return jsonContent({ data: serializeCombinedBalanceHistory(combined) });
    },
  );
}
