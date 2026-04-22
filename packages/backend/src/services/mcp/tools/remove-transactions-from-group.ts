import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { removeTransactionsFromGroup } from '@services/transaction-groups';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerRemoveTransactionsFromGroup(server: McpServer) {
  server.registerTool(
    'remove_transactions_from_group',
    {
      description:
        'Remove transactions from a group. If removal would leave fewer than 2 transactions, pass force=true to dissolve the group entirely (transactions are kept). Requires finance:write scope.',
      inputSchema: {
        groupId: z.number().describe('ID of the transaction group'),
        transactionIds: z.array(z.number()).describe('IDs of transactions to remove from the group'),
        force: z
          .boolean()
          .optional()
          .describe(
            'When true, dissolves the group if too few transactions would remain. Default: false (returns error instead)',
          ),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'remove_transactions_from_group', clientId: extra.authInfo?.clientId });

      const result = await removeTransactionsFromGroup({
        groupId: args.groupId,
        userId,
        transactionIds: args.transactionIds,
        force: args.force,
      });

      return jsonContent({ data: result });
    },
  );
}
