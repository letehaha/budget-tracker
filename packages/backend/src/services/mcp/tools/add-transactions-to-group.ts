import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addTransactionsToGroup } from '@services/transaction-groups';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerAddTransactionsToGroup(server: McpServer) {
  server.registerTool(
    'add_transactions_to_group',
    {
      description:
        'Add one or more transactions to an existing transaction group. Transfer pairs are auto-included. Returns the updated group with all its transactions. Requires finance:write scope.',
      inputSchema: {
        groupId: z.number().describe('ID of the transaction group to add transactions to'),
        transactionIds: z.array(z.number()).describe('IDs of transactions to add to the group'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'add_transactions_to_group', clientId: extra.authInfo?.clientId });

      const result = await addTransactionsToGroup({
        groupId: args.groupId,
        userId,
        transactionIds: args.transactionIds,
      });

      return jsonContent({ data: result });
    },
  );
}
