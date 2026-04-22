import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deleteInvestmentTransaction } from '@services/investments/transactions/delete.service';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerDeleteInvestmentTransaction(server: McpServer) {
  server.registerTool(
    'delete_investment_transaction',
    {
      description:
        'Permanently delete an investment transaction. The holding and portfolio cash balance are automatically recalculated after deletion. This action is irreversible — confirm with the user before calling. Obtain transactionId from get_investment_transactions.',
      inputSchema: {
        transactionId: z.number().describe('Investment transaction ID to delete (from get_investment_transactions)'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_investment_transaction', clientId: extra.authInfo?.clientId });

      const result = await deleteInvestmentTransaction({
        userId,
        transactionId: args.transactionId,
      });

      return jsonContent({ data: result });
    },
  );
}
