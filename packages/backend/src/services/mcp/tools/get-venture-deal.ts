import { recordId } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getVentureDeal } from '@services/venture/deals/get.service';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetVentureDeal(server: McpServer) {
  server.registerTool(
    'get_venture_deal',
    {
      description:
        "Retrieve a single venture deal by id, including its platform and currency. Pass includeEvents=true to also embed the deal's event history (sorted asc). Obtain the dealId from list_venture_deals.",
      inputSchema: {
        dealId: recordId().describe('Venture deal ID (from list_venture_deals)'),
        includeEvents: z
          .boolean()
          .optional()
          .describe("When true, embed the deal's event history in the response. Default: false."),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_venture_deal', clientId: extra.authInfo?.clientId });

      const deal = await getVentureDeal({
        userId,
        dealId: args.dealId,
        includeEvents: args.includeEvents,
      });

      return jsonContent({ data: deal });
    },
  );
}
