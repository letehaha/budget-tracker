import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deletePayee } from '@services/payees';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerDeletePayee(server: McpServer) {
  server.registerTool(
    'delete_payee',
    {
      description:
        'Delete a Payee. Linked transactions retain their categoryId but their payeeId is set to null. Use cautiously — this is irreversible.',
      inputSchema: {
        id: z.string().describe('Payee id to delete.'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'delete_payee', clientId: extra.authInfo?.clientId });
      await deletePayee({ userId, id: args.id });
      return jsonContent({ data: { ok: true } });
    },
  );
}
