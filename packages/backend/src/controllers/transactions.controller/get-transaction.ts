import {
  ACCOUNT_TYPES,
  CATEGORIZATION_SOURCE,
  FILTER_OPERATION,
  SORT_DIRECTIONS,
  TRANSACTION_SORT_FIELD,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { booleanQuery, dateRange, recordId, withDateOrder } from '@common/lib/zod/custom-types';
import { Money } from '@common/types/money';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeTransactions } from '@root/serializers';
import * as transactionsService from '@services/transactions';
import { z } from 'zod';

const parseCommaSeparatedStrings = (value: string) =>
  value
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);

const schema = z.object({
  query: withDateOrder(
    z
      .object({
        order: z.nativeEnum(SORT_DIRECTIONS).optional().default(SORT_DIRECTIONS.desc),
        sortBy: z.nativeEnum(TRANSACTION_SORT_FIELD).optional(),
        // Exact set of transferNature values to include. Supersedes transferFilter when present.
        transferNatures: z
          .preprocess(
            (val) => (typeof val === 'string' ? parseCommaSeparatedStrings(val) : val),
            z.array(z.nativeEnum(TRANSACTION_TRANSFER_NATURE)),
          )
          .optional(),
        limit: z.preprocess((val) => Number(val), z.number().int().positive()).optional(),
        // Pagination row offset. Named `offset` to match the shared pagination vocabulary;
        // the model still calls this `from` internally (mapped in the handler below).
        offset: z
          .preprocess((val) => Number(val), z.number().int().nonnegative())
          .optional()
          .default(0),
        ...dateRange({ precision: 'datetime' }),
        transactionType: z.nativeEnum(TRANSACTION_TYPES).optional(),
        accountType: z.nativeEnum(ACCOUNT_TYPES).optional(),
        accountIds: z
          .preprocess((val) => (typeof val === 'string' ? parseCommaSeparatedStrings(val) : val), z.array(recordId()))
          .optional(),
        budgetIds: z
          .preprocess((val) => (typeof val === 'string' ? parseCommaSeparatedStrings(val) : val), z.array(recordId()))
          .optional(),
        excludedBudgetIds: z
          .preprocess((val) => (typeof val === 'string' ? parseCommaSeparatedStrings(val) : val), z.array(recordId()))
          .optional(),
        tagIds: z
          .preprocess((val) => (typeof val === 'string' ? parseCommaSeparatedStrings(val) : val), z.array(recordId()))
          .optional(),
        excludedTagIds: z
          .preprocess((val) => (typeof val === 'string' ? parseCommaSeparatedStrings(val) : val), z.array(recordId()))
          .optional(),
        categoryIds: z
          .preprocess((val) => (typeof val === 'string' ? parseCommaSeparatedStrings(val) : val), z.array(recordId()))
          .optional(),
        payeeIds: z
          .preprocess((val) => (typeof val === 'string' ? parseCommaSeparatedStrings(val) : val), z.array(recordId()))
          .optional(),
        excludeAccountIds: z
          .preprocess((val) => (typeof val === 'string' ? parseCommaSeparatedStrings(val) : val), z.array(recordId()))
          .optional(),
        includeSplits: booleanQuery().optional(),
        includeTags: booleanQuery().optional(),
        includeGroups: booleanQuery().optional(),
        excludeTransfer: booleanQuery().optional(),
        excludeRefunds: booleanQuery().optional(),
        transferFilter: z.nativeEnum(FILTER_OPERATION).optional(),
        refundFilter: z.nativeEnum(FILTER_OPERATION).optional(),
        // Amount filters now accept decimals from API
        amountLte: z.preprocess((val) => Number(val), z.number().positive()).optional(),
        amountGte: z.preprocess((val) => Number(val), z.number().positive()).optional(),
        noteSearch: z
          .string()
          .optional()
          .refine((val) => val !== '[object Object]', {
            message: 'Invalid noteSearch value: received object instead of string',
          })
          .transform((val) => {
            if (!val || val === '') return undefined;
            return parseCommaSeparatedStrings(val);
          }),
        categorizationSource: z.nativeEnum(CATEGORIZATION_SOURCE).optional(),
      })
      .refine(
        (data) => {
          if (data.amountGte && data.amountLte) {
            return data.amountGte <= data.amountLte;
          }
          return true;
        },
        {
          message: 'amountGte must be less than or equal to amountLte',
          path: ['amountGte'],
        },
      ),
  ),
});

export default createController(schema, async ({ user, query }) => {
  const { id: userId } = user;

  // Convert decimal amount filters to Money for DB query
  const amountGte = query.amountGte !== undefined ? Money.fromDecimal(query.amountGte) : undefined;
  const amountLte = query.amountLte !== undefined ? Money.fromDecimal(query.amountLte) : undefined;

  const { offset, from, to, ...filters } = query;

  const transactions = await transactionsService.getTransactions({
    ...filters,
    // The transactions model paginates on `from` (a row offset) and date-filters on
    // `startDate`/`endDate`. This endpoint speaks the shared request vocabulary —
    // `offset` for pagination, `from`/`to` for the date range — so both are mapped onto
    // the model's parameter names here, at the HTTP boundary.
    from: offset,
    startDate: from,
    endDate: to,
    amountGte,
    amountLte,
    userId,
  });

  // Serialize: convert cents to decimal for API response
  return { data: serializeTransactions(transactions) };
});
