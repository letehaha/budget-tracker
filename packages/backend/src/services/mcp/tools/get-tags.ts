import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTags } from '@services/tags/get-tags';

import { getUserId, jsonContent } from './helpers';

export function registerGetTags(server: McpServer) {
  server.registerTool(
    'get_tags',
    { description: 'List all user tags. Returns tag ID, name, color, and icon.' },
    async (extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_tags', clientId: extra.authInfo?.clientId });
      const tags = await getTags({ userId });

      const result = tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        icon: t.icon,
      }));

      return jsonContent({ data: result });
    },
  );
}
