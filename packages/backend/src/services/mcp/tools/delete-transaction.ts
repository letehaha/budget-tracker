import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deleteTransaction } from '@services/transactions/delete-transaction';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerDeleteTransaction(server: McpServer) {
  server.registerTool(
    'delete_transaction',
    {
      description:
        'Permanently delete a transaction by ID. DESTRUCTIVE: this cannot be undone. For transfer transactions, both sides of the transfer are deleted.',
      inputSchema: {
        id: z.number().describe('ID of the transaction to delete'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_transaction', clientId: extra.authInfo?.clientId });

      await deleteTransaction({ id: args.id, userId });

      return jsonContent({ data: { deleted: true, id: args.id } });
    },
  );
}
