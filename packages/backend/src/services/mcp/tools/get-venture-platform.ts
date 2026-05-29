import { recordId } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getVenturePlatform } from '@services/venture/platforms/get.service';

import { getUserId, jsonContent } from './helpers';

export function registerGetVenturePlatform(server: McpServer) {
  server.registerTool(
    'get_venture_platform',
    {
      description:
        'Retrieve a single venture platform by id. Returns full record including default fee fractions (decimals in [0,1]). Obtain the platformId from list_venture_platforms.',
      inputSchema: {
        platformId: recordId().describe('Venture platform ID (from list_venture_platforms)'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_venture_platform', clientId: extra.authInfo?.clientId });

      const platform = await getVenturePlatform({ userId, platformId: args.platformId });

      return jsonContent({ data: platform });
    },
  );
}
