import { VENTURE_DEAL_STATUS } from '@bt/shared/types/venture';
import { recordId } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listVentureDeals } from '@services/venture/deals/list.service';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerListVentureDeals(server: McpServer) {
  server.registerTool(
    'list_venture_deals',
    {
      description:
        "List the user's venture deals (private/illiquid investments through SPVs, syndicates, or direct vehicles). Returns each deal's id, name, status (outstanding | partial_exit | fully_exited | written_off), platform, currency, principal, entry fee, fee fractions, dates, and target company. Use the returned id with get_venture_deal, get_venture_deal_metrics, list_venture_events, and update_venture_deal.",
      inputSchema: {
        status: z.nativeEnum(VENTURE_DEAL_STATUS).optional().describe('Filter by status'),
        platformId: recordId().optional().describe('Filter by platform id'),
        limit: z.number().optional().describe('Max results'),
        offset: z.number().optional().describe('Pagination offset (default: 0)'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'list_venture_deals', clientId: extra.authInfo?.clientId });

      const deals = await listVentureDeals({
        userId,
        status: args.status,
        platformId: args.platformId,
        limit: args.limit,
        offset: args.offset,
      });

      return jsonContent({ data: deals });
    },
  );
}
