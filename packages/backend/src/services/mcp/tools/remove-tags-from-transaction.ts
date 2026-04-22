import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { removeTransactionsFromTag } from '@services/tags/transaction-tags';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerRemoveTagsFromTransaction(server: McpServer) {
  server.registerTool(
    'remove_tags_from_transaction',
    {
      description:
        'Remove a tag from one or more transactions. Use when the user wants to untag transactions. Returns the count of removed tag links.',
      inputSchema: {
        tagId: z.number().describe('ID of the tag to remove from transactions.'),
        transactionIds: z.array(z.number()).describe('List of transaction IDs to remove the tag from.'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'remove_tags_from_transaction', clientId: extra.authInfo?.clientId });

      const result = await removeTransactionsFromTag({
        tagId: args.tagId,
        userId,
        transactionIds: args.transactionIds,
      });
      return jsonContent({ data: result });
    },
  );
}
