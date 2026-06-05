import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSubscriptionsSummary } from '@services/subscriptions';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetSubscriptionsSummary(server: McpServer) {
  server.registerTool(
    'get_subscriptions_summary',
    {
      description:
        'Aggregate cost summary across all active subscriptions with an expected amount. Returns estimated monthly cost, projected yearly cost, count of active subscriptions, average monthly income over the last 6 complete months, and percent of income spent on subscriptions (all monetary values in the user base currency). Useful for "how much am I spending on subscriptions per month?" or "what share of my income goes to subscriptions?"',
      inputSchema: {
        type: z
          .enum([SUBSCRIPTION_TYPES.subscription, SUBSCRIPTION_TYPES.bill])
          .optional()
          .describe('Limit the summary to a specific type: "subscription" or "bill"'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_subscriptions_summary', clientId: extra.authInfo?.clientId });

      const result = await getSubscriptionsSummary({ userId, type: args.type });

      return jsonContent({ data: result });
    },
  );
}
