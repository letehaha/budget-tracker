import { Money } from '@common/types/money';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { editBudget } from '@services/budgets/edit-budget';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerUpdateBudget(server: McpServer) {
  server.registerTool(
    'update_budget',
    {
      description:
        "Update an existing budget's name, date range, spending limit, or linked categories. Returns the updated budget record.",
      inputSchema: {
        budgetId: z.number().describe('ID of the budget to update'),
        name: z.string().optional().describe('New budget name'),
        startDate: z.string().optional().describe('New start date (ISO 8601)'),
        endDate: z.string().optional().describe('New end date (ISO 8601)'),
        limitAmount: z
          .number()
          .optional()
          .describe("New spending limit as a decimal amount in the user's base currency (e.g. 500.00)"),
        autoInclude: z.boolean().optional().describe('Whether to auto-include transactions in the date range'),
        categoryIds: z
          .array(z.number())
          .optional()
          .describe('Replace the linked category IDs (only applies to category-type budgets)'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'update_budget', clientId: extra.authInfo?.clientId });

      const budget = await editBudget({
        id: args.budgetId,
        userId,
        name: args.name,
        startDate: args.startDate,
        endDate: args.endDate,
        limitAmount: args.limitAmount !== undefined ? Money.fromDecimal(args.limitAmount) : undefined,
        autoInclude: args.autoInclude,
        categoryIds: args.categoryIds,
      });

      return jsonContent({ data: budget });
    },
  );
}
