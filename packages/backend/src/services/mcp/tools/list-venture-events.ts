import { recordId } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listVentureEvents } from '@services/venture/events/list.service';

import { getUserId, jsonContent } from './helpers';

export function registerListVentureEvents(server: McpServer) {
  server.registerTool(
    'list_venture_events',
    {
      description:
        'List events for a venture deal in chronological order (oldest first). Each event has a type (initial_investment | capital_call | distribution | nav_update | exit | writedown | fee_payment), date, amounts, cashFlowMode, and embedded link rows (when the event is tied to bank transactions). Use the returned event ids with get_venture_event, update_venture_event, and delete_venture_event.',
      inputSchema: {
        dealId: recordId().describe('Venture deal ID (from list_venture_deals)'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'list_venture_events', clientId: extra.authInfo?.clientId });

      const events = await listVentureEvents({ userId, dealId: args.dealId });

      return jsonContent({ data: events });
    },
  );
}
