import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { detectCandidates } from '@services/subscriptions';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerDetectSubscriptionCandidates(server: McpServer) {
  server.registerTool(
    'detect_subscription_candidates',
    {
      description:
        'Scan the past 12 months of transactions to detect recurring payment patterns and generate subscription candidates. This operation can be slow on large transaction histories. Results are cached for 1 hour — subsequent calls within the cooldown return cached candidates. Check isFromCache in the response to know if the data is fresh. Requires finance:write scope (writes candidate records).',
    },
    async (extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'detect_subscription_candidates', clientId: extra.authInfo?.clientId });

      const result = await detectCandidates({ userId });

      return jsonContent({ data: result });
    },
  );
}
