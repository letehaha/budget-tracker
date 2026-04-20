import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCategories } from '@services/categories.service';

import { getUserId, jsonContent } from './helpers';

export function registerGetCategories(server: McpServer) {
  server.registerTool(
    'get_categories',
    {
      description:
        'List all transaction categories. Returns category ID, name, color, icon, type (income/expense), and parent ID for hierarchical categories.',
    },
    async (extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_categories', clientId: extra.authInfo?.clientId });
      const categories = await getCategories({ userId });

      const result = categories.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        icon: c.icon,
        type: c.type,
        parentId: c.parentId,
      }));

      return jsonContent({ data: result });
    },
  );
}
