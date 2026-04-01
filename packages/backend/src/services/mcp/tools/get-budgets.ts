import { BUDGET_STATUSES } from '@bt/shared/types';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { serializeBudgets } from '@root/serializers/budgets.serializer';
import { getBudgets } from '@services/budget.service';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetBudgets(server: McpServer) {
  server.tool(
    'get_budgets',
    'List budgets with their spending limits and associated categories. Filter by status (active, archived, closed). Returns budget name, limit amount, status, date range, and linked categories.',
    {
      status: z
        .enum([BUDGET_STATUSES.active, BUDGET_STATUSES.archived, BUDGET_STATUSES.closed])
        .optional()
        .describe('Filter by budget status. Default: active'),
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      const statuses: BUDGET_STATUSES[] = args.status ? [args.status] : [BUDGET_STATUSES.active];

      const budgets = await getBudgets({
        userId,
        statuses,
      });

      return jsonContent({ data: serializeBudgets(budgets) });
    },
  );
}
