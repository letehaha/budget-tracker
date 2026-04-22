import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSubscription } from '@services/subscriptions';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerCreateSubscription(server: McpServer) {
  server.registerTool(
    'create_subscription',
    {
      description:
        'Create a new subscription or recurring bill. Use type="subscription" for SaaS/streaming services and type="bill" for utilities and one-time recurring payments. expectedAmount is a decimal in the subscription currency. Requires finance:write scope.',
      inputSchema: {
        name: z.string().describe('Display name of the subscription (e.g. "Netflix", "Electricity")'),
        frequency: z
          .enum([
            SUBSCRIPTION_FREQUENCIES.weekly,
            SUBSCRIPTION_FREQUENCIES.biweekly,
            SUBSCRIPTION_FREQUENCIES.monthly,
            SUBSCRIPTION_FREQUENCIES.quarterly,
            SUBSCRIPTION_FREQUENCIES.semiAnnual,
            SUBSCRIPTION_FREQUENCIES.annual,
          ])
          .describe('Billing frequency: weekly, biweekly, monthly, quarterly, semi_annual, annual'),
        startDate: z.string().describe('Start date of the subscription (ISO 8601, e.g. "2024-01-01")'),
        type: z
          .enum([SUBSCRIPTION_TYPES.subscription, SUBSCRIPTION_TYPES.bill])
          .optional()
          .describe('Type: "subscription" (default) or "bill"'),
        expectedAmount: z
          .number()
          .nullable()
          .optional()
          .describe('Expected payment amount as a decimal (e.g. 9.99). Use with expectedCurrencyCode'),
        expectedCurrencyCode: z
          .string()
          .nullable()
          .optional()
          .describe('Currency code for expectedAmount (e.g. "USD", "EUR")'),
        endDate: z.string().nullable().optional().describe('End date if the subscription is finite (ISO 8601)'),
        accountId: z.number().nullable().optional().describe('Account ID to associate with this subscription'),
        categoryId: z.number().nullable().optional().describe('Category ID to associate with this subscription'),
        notes: z.string().nullable().optional().describe('Additional notes about the subscription'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'create_subscription', clientId: extra.authInfo?.clientId });

      const result = await createSubscription({
        userId,
        name: args.name,
        frequency: args.frequency,
        startDate: args.startDate,
        type: args.type,
        expectedAmount: args.expectedAmount,
        expectedCurrencyCode: args.expectedCurrencyCode,
        endDate: args.endDate,
        accountId: args.accountId,
        categoryId: args.categoryId,
        notes: args.notes,
      });

      return jsonContent({ data: result });
    },
  );
}
