import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deleteCategory } from '@services/categories/delete-category';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerDeleteCategory(server: McpServer) {
  server.registerTool(
    'delete_category',
    {
      description:
        'Permanently delete a category by ID. This is destructive — if the category has linked transactions you must supply replaceWithCategoryId to reassign them first, otherwise the call will fail. Cannot delete a parent category that still has subcategories. Only call when the user explicitly confirms deletion.',
      inputSchema: {
        categoryId: z.number().describe('ID of the category to delete.'),
        replaceWithCategoryId: z
          .number()
          .optional()
          .describe(
            'ID of the category to reassign linked transactions to. Required when the category has transactions.',
          ),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_category', clientId: extra.authInfo?.clientId });

      await deleteCategory({ userId, categoryId: args.categoryId, replaceWithCategoryId: args.replaceWithCategoryId });
      return jsonContent({ data: { success: true } });
    },
  );
}
