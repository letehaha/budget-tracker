import { recordId } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getVentureEvent } from '@services/venture/events/get.service';

import { getUserId, jsonContent } from './helpers';

export function registerGetVentureEvent(server: McpServer) {
  server.registerTool(
    'get_venture_event',
    {
      description:
        'Retrieve a single venture event by id, including its link rows (bank transactions linked to this event). Obtain the eventId from list_venture_events.',
      inputSchema: {
        eventId: recordId().describe('Venture event ID (from list_venture_events)'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_venture_event', clientId: extra.authInfo?.clientId });

      const event = await getVentureEvent({ userId, eventId: args.eventId });

      return jsonContent({ data: event });
    },
  );
}
