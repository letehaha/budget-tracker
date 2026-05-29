import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deleteSplit } from '@services/transactions/splits/delete-split';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerDeleteSplit(server: McpServer) {
  server.registerTool(
    'delete_split',
    {
      description:
        'Delete a single split from a transaction by its split ID (UUID string). DESTRUCTIVE: the split amount returns to the primary category. Fails if the split has refunds targeting it.',
      inputSchema: {
        splitId: z.string().describe('UUID of the split to delete'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_split', clientId: extra.authInfo?.clientId });

      const result = await deleteSplit({ splitId: args.splitId, userId });

      return jsonContent({ data: result });
    },
  );
}
