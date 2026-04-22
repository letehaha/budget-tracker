import { BUDGET_STATUSES, BUDGET_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createBudget } from '@services/budgets/create-budget';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerCreateBudget(server: McpServer) {
  server.registerTool(
    'create_budget',
    {
      description:
        'Create a new budget with an optional spending limit, date range, and linked categories. Returns the created budget with its ID, status, type, and associated categories.',
      inputSchema: {
        name: z.string().describe('Budget name'),
        status: z
          .enum([BUDGET_STATUSES.active, BUDGET_STATUSES.archived, BUDGET_STATUSES.closed])
          .optional()
          .describe('Budget status (default: active)'),
        type: z
          .enum([BUDGET_TYPES.manual, BUDGET_TYPES.category])
          .optional()
          .describe(
            'Budget type: manual (transactions linked explicitly) or category (auto-tracks by category). Default: manual',
          ),
        categoryIds: z
          .array(z.number())
          .optional()
          .describe('Category IDs to link (only used when type is "category")'),
        startDate: z.string().optional().describe('Budget start date (ISO 8601)'),
        endDate: z.string().optional().describe('Budget end date (ISO 8601)'),
        autoInclude: z
          .boolean()
          .optional()
          .describe('Auto-include transactions in the date range when creating (manual budgets only)'),
        limitAmount: z
          .number()
          .optional()
          .describe("Spending limit as a decimal amount in the user's base currency (e.g. 500.00)"),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'create_budget', clientId: extra.authInfo?.clientId });

      const budget = await createBudget({
        userId,
        name: args.name,
        status: args.status ?? BUDGET_STATUSES.active,
        type: args.type,
        categoryIds: args.categoryIds,
        startDate: args.startDate ? new Date(args.startDate) : undefined,
        endDate: args.endDate ? new Date(args.endDate) : undefined,
        autoInclude: args.autoInclude,
        limitAmount: args.limitAmount !== undefined ? Money.fromDecimal(args.limitAmount) : undefined,
      });

      return jsonContent({ data: budget });
    },
  );
}
