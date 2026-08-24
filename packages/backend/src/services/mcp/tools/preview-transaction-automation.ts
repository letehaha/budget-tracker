import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { previewAutomation } from '@services/transaction-automations/preview';

import { getUserId, jsonContent } from './helpers';
import { automationConditionsInput } from './transaction-automation-inputs';

const inputSchema = {
  conditions: automationConditionsInput,
};

export function registerPreviewTransactionAutomation(server: McpServer) {
  server.registerTool(
    'preview_transaction_automation',
    {
      description:
        'Dry-run a set of automation conditions against up to the last 1000 eligible existing transactions and return { matchedCount, scannedCount, matches } where matches is capped at 5 sample transactions. Nothing is modified. Use it to sanity-check conditions before create_transaction_automation or update_transaction_automation. Note that a live automation only fires for newly synced or imported bank transactions that are not transfers and not planned, so it never changes the existing transactions listed here.',
      inputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'preview_transaction_automation', clientId: extra.authInfo?.clientId });

      const result = await previewAutomation({ userId, conditions: args.conditions });

      return jsonContent({ data: result });
    },
  );
}
