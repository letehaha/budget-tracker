import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listVenturePlatforms } from '@services/venture/platforms/list.service';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerListVenturePlatforms(server: McpServer) {
  server.registerTool(
    'list_venture_platforms',
    {
      description:
        "List the user's venture investment platforms (SPV syndicators, fund managers). Returns each platform's id, name, website, description, and default fee fractions (entry fee, management fee, carry, hurdle). Fee values are decimals in [0,1] — e.g. 0.085 means 8.5%. Use the returned id with get_venture_platform, create_venture_deal, and update_venture_platform.",
      inputSchema: {
        limit: z.number().optional().describe('Max results'),
        offset: z.number().optional().describe('Pagination offset (default: 0)'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'list_venture_platforms', clientId: extra.authInfo?.clientId });

      const platforms = await listVenturePlatforms({ userId, limit: args.limit, offset: args.offset });

      return jsonContent({ data: platforms });
    },
  );
}
