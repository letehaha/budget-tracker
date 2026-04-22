import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deleteTransactionGroup } from '@services/transaction-groups';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerDeleteTransactionGroup(server: McpServer) {
  server.registerTool(
    'delete_transaction_group',
    {
      description:
        'Permanently delete a transaction group. The transactions themselves are NOT deleted — only the grouping is removed. This action cannot be undone. Requires finance:delete scope.',
      inputSchema: {
        id: z.number().describe('ID of the transaction group to delete'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_transaction_group', clientId: extra.authInfo?.clientId });

      const result = await deleteTransactionGroup({ id: args.id, userId });

      return jsonContent({ data: result });
    },
  );
}
