import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { serializeTransactions } from '@root/serializers/transactions.serializer';
import { linkTransactions } from '@services/transactions/transactions-linking/link-transactions';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerLinkTransfer(server: McpServer) {
  server.registerTool(
    'link_transfer',
    {
      description:
        'Link two existing transactions as a transfer pair. The two transactions must be in different accounts and have opposite types (one income, one expense). Provide baseTxId (the source/expense side) and oppositeTxId (the destination/income side).',
      inputSchema: {
        baseTxId: z.number().describe('ID of the base (source) transaction — typically the expense side'),
        oppositeTxId: z.number().describe('ID of the opposite (destination) transaction — typically the income side'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'link_transfer', clientId: extra.authInfo?.clientId });

      const results = await linkTransactions({
        userId,
        ids: [[args.baseTxId, args.oppositeTxId]],
      });

      const [baseTx, oppositeTx] = results[0]!;

      return jsonContent({ data: serializeTransactions([baseTx, oppositeTx]) });
    },
  );
}
