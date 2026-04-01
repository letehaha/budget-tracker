import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { serializeExpensesAmountForPeriod } from '@root/serializers/stats.serializer';
import { getExpensesAmountForPeriod } from '@services/stats/get-expenses-amount-for-period';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetExpensesForPeriod(server: McpServer) {
  server.tool(
    'get_expenses_for_period',
    'Get total expense amount for a date range. Returns a single total number. Use this for quick "how much did I spend" queries instead of summing transactions manually.',
    {
      startDate: z.string().optional().describe('Start date (ISO 8601). Default: start of current month'),
      endDate: z.string().optional().describe('End date (ISO 8601). Default: today'),
      accountId: z.number().optional().describe('Filter by specific account ID'),
      excludedCategoryIds: z.array(z.number()).optional().describe('Exclude specific category IDs from total'),
    },
    async (args, extra) => {
      const userId = getUserId({ extra });

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const totalCents = await getExpensesAmountForPeriod({
        userId,
        from: args.startDate ?? startOfMonth.toISOString(),
        to: args.endDate ?? now.toISOString(),
        accountId: args.accountId,
        excludedCategoryIds: args.excludedCategoryIds,
      });

      return jsonContent({
        data: {
          totalExpenses: serializeExpensesAmountForPeriod(totalCents),
          period: {
            startDate: args.startDate ?? startOfMonth.toISOString().split('T')[0],
            endDate: args.endDate ?? now.toISOString().split('T')[0],
          },
        },
      });
    },
  );
}
