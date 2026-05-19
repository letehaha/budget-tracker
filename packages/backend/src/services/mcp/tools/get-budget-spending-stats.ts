import { recordId } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBudgetSpendingStats } from '@services/budgets/spending-stats';

import { getUserId, jsonContent } from './helpers';

export function registerGetBudgetSpendingStats(server: McpServer) {
  server.registerTool(
    'get_budget_spending_stats',
    {
      description:
        'Get spending statistics for a budget: spending broken down by category and a time-series of expense vs income over the budget period. Granularity is weekly for ranges ≤60 days, monthly otherwise. Amounts are in cents.',
      inputSchema: {
        budgetId: recordId().describe('ID of the budget to retrieve spending stats for'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_budget_spending_stats', clientId: extra.authInfo?.clientId });

      const stats = await getBudgetSpendingStats({ userId, budgetId: args.budgetId });

      return jsonContent({ data: stats });
    },
  );
}
