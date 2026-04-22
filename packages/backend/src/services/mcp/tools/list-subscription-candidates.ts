import { SUBSCRIPTION_CANDIDATE_STATUS } from '@bt/shared/types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCandidates } from '@services/subscriptions';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerListSubscriptionCandidates(server: McpServer) {
  server.registerTool(
    'list_subscription_candidates',
    {
      description:
        'List auto-detected subscription candidates sorted by confidence score. Call detect_subscription_candidates first to generate fresh candidates. Use status filter to see only pending, accepted, or dismissed candidates.',
      inputSchema: {
        status: z
          .enum([
            SUBSCRIPTION_CANDIDATE_STATUS.pending,
            SUBSCRIPTION_CANDIDATE_STATUS.accepted,
            SUBSCRIPTION_CANDIDATE_STATUS.dismissed,
          ])
          .optional()
          .describe('Filter by candidate status. Omit to return all statuses'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'list_subscription_candidates', clientId: extra.authInfo?.clientId });

      const result = await getCandidates({ userId, status: args.status });

      return jsonContent({ data: result });
    },
  );
}
