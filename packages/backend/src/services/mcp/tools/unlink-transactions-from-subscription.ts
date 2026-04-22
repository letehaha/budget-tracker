import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { unlinkTransactionsFromSubscription } from '@services/subscriptions';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerUnlinkTransactionsFromSubscription(server: McpServer) {
  server.registerTool(
    'unlink_transactions_from_subscription',
    {
      description:
        'Unlink transactions from a subscription without deleting them. The link record is marked as unlinked and excluded from subscription history. Requires finance:write scope.',
      inputSchema: {
        subscriptionId: z.string().describe('UUID of the subscription'),
        transactionIds: z.array(z.number()).describe('IDs of transactions to unlink from the subscription'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({
        userId,
        tool: 'unlink_transactions_from_subscription',
        clientId: extra.authInfo?.clientId,
      });

      const result = await unlinkTransactionsFromSubscription({
        subscriptionId: args.subscriptionId,
        transactionIds: args.transactionIds,
        userId,
      });

      return jsonContent({ data: result });
    },
  );
}
