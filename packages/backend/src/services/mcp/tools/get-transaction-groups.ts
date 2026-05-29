import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTransactionGroups } from '@services/transaction-groups';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetTransactionGroups(server: McpServer) {
  server.registerTool(
    'get_transaction_groups',
    {
      description:
        'List all transaction groups for the user. Groups bundle related transactions (e.g. split expenses). When includeTransactions is true, each group contains the full transaction list; otherwise returns aggregate counts and date ranges.',
      inputSchema: {
        includeTransactions: z
          .boolean()
          .optional()
          .describe('When true, embed full transaction data in each group. Default: false (aggregates only)'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_transaction_groups', clientId: extra.authInfo?.clientId });

      const result = await getTransactionGroups({ userId, includeTransactions: args.includeTransactions });

      return jsonContent({ data: result });
    },
  );
}
