import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { removeTransactionsFromBudget } from '@services/budgets/remove-transactions-from-budget';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerRemoveTransactionsFromBudget(server: McpServer) {
  server.registerTool(
    'remove_transactions_from_budget',
    {
      description:
        'Unlink one or more transactions from a budget. Does not delete the transactions themselves. Returns nothing on success.',
      inputSchema: {
        budgetId: z.number().describe('ID of the budget to unlink transactions from'),
        transactionIds: z.array(z.number()).describe('IDs of the transactions to remove from the budget'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'remove_transactions_from_budget', clientId: extra.authInfo?.clientId });

      await removeTransactionsFromBudget({
        budgetId: args.budgetId,
        userId,
        transactionIds: args.transactionIds,
      });

      return jsonContent({ data: { success: true } });
    },
  );
}
