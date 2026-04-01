import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTags } from '@services/tags/get-tags';

import { getUserId, jsonContent } from './helpers';

export function registerGetTags(server: McpServer) {
  server.tool('get_tags', 'List all user tags. Returns tag ID, name, color, and icon.', {}, async (_args, extra) => {
    const userId = getUserId({ extra });
    const tags = await getTags({ userId });

    const result = tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      icon: t.icon,
    }));

    return jsonContent({ data: result });
  });
}
