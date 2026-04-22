import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSubscriptions } from '@services/subscriptions';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetSubscriptions(server: McpServer) {
  server.registerTool(
    'get_subscriptions',
    {
      description:
        'List all subscriptions and recurring bills for the user. Returns name, frequency, expected amount, linked account/category, active state, and linked transaction count. Use isActive to filter active-only.',
      inputSchema: {
        isActive: z.boolean().optional().describe('Filter by active state. Omit to return all subscriptions'),
        type: z
          .enum([SUBSCRIPTION_TYPES.subscription, SUBSCRIPTION_TYPES.bill])
          .optional()
          .describe('Filter by type: "subscription" or "bill"'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_subscriptions', clientId: extra.authInfo?.clientId });

      const result = await getSubscriptions({ userId, isActive: args.isActive, type: args.type });

      return jsonContent({ data: result });
    },
  );
}
