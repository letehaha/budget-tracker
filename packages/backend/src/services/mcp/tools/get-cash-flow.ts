import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { serializeCashFlow } from '@root/serializers/stats.serializer';
import { getCashFlow } from '@services/stats/get-cash-flow';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetCashFlow(server: McpServer) {
  server.tool(
    'get_cash_flow',
    'Get income, expenses, and net cash flow for a period with configurable granularity (monthly/biweekly/weekly). Returns period-by-period breakdown plus totals with savings rate.',
    {
      startDate: z.string().describe('Period start date (ISO 8601). Required.'),
      endDate: z.string().describe('Period end date (ISO 8601). Required.'),
      granularity: z.enum(['monthly', 'biweekly', 'weekly']).optional().describe('Time granularity. Default: monthly'),
      accountId: z.number().optional().describe('Filter by specific account ID'),
      categoryIds: z.array(z.number()).optional().describe('Filter by category IDs'),
    },
    async (args, extra) => {
      const userId = getUserId({ extra });

      const cashFlow = await getCashFlow({
        userId,
        from: args.startDate,
        to: args.endDate,
        granularity: args.granularity ?? 'monthly',
        accountId: args.accountId,
        categoryIds: args.categoryIds,
      });

      return jsonContent({ data: serializeCashFlow(cashFlow) });
    },
  );
}
