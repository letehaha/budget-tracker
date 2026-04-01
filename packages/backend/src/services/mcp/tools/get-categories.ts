import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCategories } from '@services/categories.service';

import { getUserId, jsonContent } from './helpers';

export function registerGetCategories(server: McpServer) {
  server.tool(
    'get_categories',
    'List all transaction categories. Returns category ID, name, color, icon, type (income/expense), and parent ID for hierarchical categories.',
    {},
    async (_args, extra) => {
      const userId = getUserId({ extra });
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
