import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUpcomingPayments } from '@services/subscriptions';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetUpcomingSubscriptionPayments(server: McpServer) {
  server.registerTool(
    'get_upcoming_subscription_payments',
    {
      description:
        'List upcoming subscription payments sorted by next expected payment date (soonest first). Returns subscription name, expected amount, currency, next payment date, and category. Only active subscriptions with an expectedAmount are included.',
      inputSchema: {
        limit: z.number().optional().describe('Maximum number of upcoming payments to return. Default: 5'),
        type: z
          .enum([SUBSCRIPTION_TYPES.subscription, SUBSCRIPTION_TYPES.bill])
          .optional()
          .describe('Filter by type: "subscription" or "bill"'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_upcoming_subscription_payments', clientId: extra.authInfo?.clientId });

      const result = await getUpcomingPayments({ userId, limit: args.limit, type: args.type });

      return jsonContent({ data: result });
    },
  );
}
