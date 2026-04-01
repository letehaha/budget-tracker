import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { serializeAccounts } from '@root/serializers/accounts.serializer';
import { getAccounts } from '@services/accounts.service';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerGetAccounts(server: McpServer) {
  server.tool(
    'get_accounts',
    'List all user accounts with current balances. Returns account name, type, currency, current balance (in original and base currency), and credit limit.',
    {
      type: z.string().optional().describe('Filter by account type (e.g., "checking", "savings", "credit_card")'),
      includeExcludedFromStats: z.boolean().optional().describe('Include accounts excluded from stats. Default: false'),
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      const accounts = await getAccounts({ userId });

      let result = serializeAccounts(accounts);

      if (args.type) {
        result = result.filter((a) => a.type === args.type || a.accountCategory === args.type);
      }
      if (!args.includeExcludedFromStats) {
        result = result.filter((a) => !a.excludeFromStats);
      }

      return jsonContent({ data: result });
    },
  );
}
