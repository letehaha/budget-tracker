import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deleteTag } from '@services/tags/delete-tag';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerDeleteTag(server: McpServer) {
  server.registerTool(
    'delete_tag',
    {
      description:
        'Permanently delete a tag by ID. This is destructive — the tag will be removed and unlinked from all transactions. Only call when the user explicitly confirms deletion.',
      inputSchema: {
        id: z.number().describe('ID of the tag to delete.'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_tag', clientId: extra.authInfo?.clientId });

      const result = await deleteTag({ id: args.id, userId });
      return jsonContent({ data: result });
    },
  );
}
