import { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deserializeCreateTransaction, serializeTransactionTuple } from '@root/serializers';
import { createTransaction } from '@services/transactions/create-transaction';
import { z } from 'zod';

import { getUserId, jsonContent, requireScope } from './helpers';

export function registerCreateTransaction(server: McpServer) {
  server.registerTool(
    'create_transaction',
    {
      description:
        'Create a new transaction (income, expense, or transfer). Requires accountId, amount (decimal), transactionType, paymentType, and transferNature. For transfers, also provide destinationAccountId and destinationAmount. Use splits to categorize portions of the amount.',
      inputSchema: {
        accountId: z.number().describe('ID of the account the transaction belongs to'),
        amount: z.number().describe('Transaction amount as a decimal (e.g. 12.50)'),
        transactionType: z
          .enum([TRANSACTION_TYPES.income, TRANSACTION_TYPES.expense])
          .describe('Whether this is income or expense'),
        paymentType: z
          .enum([
            PAYMENT_TYPES.bankTransfer,
            PAYMENT_TYPES.cash,
            PAYMENT_TYPES.creditCard,
            PAYMENT_TYPES.debitCard,
            PAYMENT_TYPES.mobilePayment,
            PAYMENT_TYPES.voucher,
            PAYMENT_TYPES.webPayment,
          ])
          .describe('Payment method used'),
        transferNature: z
          .enum([
            TRANSACTION_TRANSFER_NATURE.not_transfer,
            TRANSACTION_TRANSFER_NATURE.common_transfer,
            TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
          ])
          .describe('Transfer type. Use not_transfer for regular income/expense'),
        categoryId: z.number().optional().describe('Category ID to assign to this transaction'),
        time: z.string().optional().describe('Transaction date/time as ISO 8601 string. Defaults to now'),
        note: z.string().optional().describe('Optional note or description for the transaction'),
        destinationAccountId: z.number().optional().describe('For transfers: destination account ID'),
        destinationAmount: z
          .number()
          .optional()
          .describe('For transfers: amount received in destination account (decimal)'),
        destinationTransactionId: z
          .number()
          .optional()
          .describe('For transfers: link to an existing destination transaction instead of creating one'),
        splits: z
          .array(
            z.object({
              categoryId: z.number().describe('Category ID for this split portion'),
              amount: z.number().describe('Amount for this split portion (decimal)'),
              note: z.string().optional().nullable().describe('Optional note for this split'),
            }),
          )
          .optional()
          .describe('Split the transaction across multiple categories'),
        tagIds: z.array(z.number()).optional().describe('Tag IDs to assign to this transaction'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      requireScope({ extra, scope: 'finance:write' });
      trackMcpToolUsed({ userId, tool: 'create_transaction', clientId: extra.authInfo?.clientId });

      const params = deserializeCreateTransaction(
        {
          amount: args.amount,
          note: args.note,
          time: args.time,
          transactionType: args.transactionType,
          paymentType: args.paymentType,
          accountId: args.accountId,
          destinationAmount: args.destinationAmount,
          destinationAccountId: args.destinationAccountId,
          destinationTransactionId: args.destinationTransactionId,
          categoryId: args.categoryId,
          transferNature: args.transferNature,
          splits: args.splits,
          tagIds: args.tagIds,
        },
        userId,
      );

      const result = await createTransaction(params);
      return jsonContent({ data: serializeTransactionTuple(result) });
    },
  );
}
