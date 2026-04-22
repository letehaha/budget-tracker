import { ACCOUNT_STATUSES } from '@bt/shared/types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { updateAccount } from '@services/accounts.service';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerArchiveAccount(server: McpServer) {
  server.registerTool(
    'archive_account',
    {
      description:
        'Archive or unarchive a user account. Archiving removes the account from groups and unlinks subscriptions. Set archived=false to restore an archived account to active status.',
      inputSchema: {
        accountId: z.number().describe('ID of the account to archive or unarchive.'),
        archived: z.boolean().describe('true to archive the account, false to unarchive (restore to active status).'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'archive_account', clientId: extra.authInfo?.clientId });

      const status = args.archived ? ACCOUNT_STATUSES.archived : ACCOUNT_STATUSES.active;

      const result = await updateAccount({
        id: args.accountId,
        userId,
        status,
      });

      return jsonContent({ data: result });
    },
  );
}
