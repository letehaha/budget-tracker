import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addTransactionsToTag } from '@services/tags/transaction-tags';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerAssignTagsToTransaction(server: McpServer) {
  server.registerTool(
    'assign_tags_to_transaction',
    {
      description:
        'Assign one or more tags to a transaction. Use when the user wants to label a transaction with existing tags. Already-assigned tags are silently skipped. Returns counts of added and skipped tags.',
      inputSchema: {
        tagId: z.number().describe('ID of the tag to assign.'),
        transactionIds: z.array(z.number()).describe('List of transaction IDs to tag.'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'assign_tags_to_transaction', clientId: extra.authInfo?.clientId });

      const result = await addTransactionsToTag({ tagId: args.tagId, userId, transactionIds: args.transactionIds });
      return jsonContent({ data: result });
    },
  );
}
