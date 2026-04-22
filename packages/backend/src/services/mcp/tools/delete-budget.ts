import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deleteBudget } from '@services/budgets/delete-budget';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerDeleteBudget(server: McpServer) {
  server.registerTool(
    'delete_budget',
    {
      description:
        'Permanently delete a budget and all its transaction links. This action cannot be undone. Returns { success: true } on completion.',
      inputSchema: {
        budgetId: z.number().describe('ID of the budget to delete'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_budget', clientId: extra.authInfo?.clientId });

      const result = await deleteBudget({ id: args.budgetId, userId });

      return jsonContent({ data: result });
    },
  );
}
