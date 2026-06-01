import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type SubscriptionDetailForMcp, slimSubscriptionDetailForMcp } from '@services/mcp/serializers';
import { getSubscriptionById } from '@services/subscriptions';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetSubscriptionById(server: McpServer) {
  server.registerTool(
    'get_subscription_by_id',
    {
      description:
        'Retrieve a single subscription by its ID including all linked transactions (with match source and date) and the computed next expected payment date.',
      inputSchema: {
        id: z.string().describe('UUID of the subscription to retrieve'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_subscription_by_id', clientId: extra.authInfo?.clientId });

      const result = await getSubscriptionById({ id: args.id, userId });

      // The service hands back a loosely-typed toJSON() blob (associations + computed
      // fields aren't in InferAttributes, and the transactions carry an index
      // signature); narrow it to the slimmer's input shape.
      return jsonContent({ data: slimSubscriptionDetailForMcp(result as unknown as SubscriptionDetailForMcp) });
    },
  );
}
