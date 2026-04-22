import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { editCategory } from '@services/categories/edit-category';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerUpdateCategory(server: McpServer) {
  server.registerTool(
    'update_category',
    {
      description:
        'Update an existing category by ID. Use when the user wants to rename, recolor, or change the icon of a category. Returns the updated category records.',
      inputSchema: {
        categoryId: z.number().describe('ID of the category to update.'),
        name: z.string().optional().describe('New category name.'),
        color: z.string().optional().describe('New hex color code (e.g. "#4CAF50").'),
        icon: z.string().nullable().optional().describe('New icon identifier, or null to clear it.'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'update_category', clientId: extra.authInfo?.clientId });

      const result = await editCategory({ userId, ...args });
      return jsonContent({ data: result });
    },
  );
}
