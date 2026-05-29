import { dateString, recordId } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDealMetrics } from '@services/venture/metrics/get-deal-metrics.service';

import { getUserId, jsonContent } from './helpers';

export function registerGetVentureDealMetrics(server: McpServer) {
  server.registerTool(
    'get_venture_deal_metrics',
    {
      description:
        'Compute aggregated metrics for a venture deal: cost basis, current value (latest NAV), total distributions, absolute and percent P&L, TVPI (total value to paid-in), DPI (distributions to paid-in), and IRR. IRR returns null for degenerate cash flows (e.g. no inflows yet). Pass asOfDate (YYYY-MM-DD) to compute metrics as of a specific date.',
      inputSchema: {
        dealId: recordId().describe('Venture deal ID (from list_venture_deals)'),
        asOfDate: dateString().optional().describe('Compute metrics as of this date (YYYY-MM-DD). Defaults to today.'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_venture_deal_metrics', clientId: extra.authInfo?.clientId });

      const metrics = await getDealMetrics({
        userId,
        dealId: args.dealId,
        asOfDate: args.asOfDate ? new Date(args.asOfDate) : undefined,
      });

      return jsonContent({ data: metrics });
    },
  );
}
