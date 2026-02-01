import {
  ACCOUNT_TYPES,
  CATEGORIZATION_SOURCE,
  SORT_DIRECTIONS,
  TRANSACTION_TYPES,
  parseToCents,
} from '@bt/shared/types';
import { booleanQuery } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeTransactions } from '@root/serializers';
import * as transactionsService from '@services/transactions';
import { z } from 'zod';

const parseCommaSeparatedNumbers = (value: string) =>
  value
    .split(',')
    .map(Number)
    .filter((n) => !isNaN(n));

const parseCommaSeparatedStrings = (value: string) =>
  value
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);

const schema = z.object({
  query: z
    .object({
      order: z.nativeEnum(SORT_DIRECTIONS).optional().default(SORT_DIRECTIONS.desc),
      limit: z.preprocess((val) => Number(val), z.number().int().positive()).optional(),
      from: z
        .preprocess((val) => Number(val), z.number().int().nonnegative())
        .optional()
        .default(0),
      transactionType: z.nativeEnum(TRANSACTION_TYPES).optional(),
      accountType: z.nativeEnum(ACCOUNT_TYPES).optional(),
      accountIds: z
        .preprocess(
          (val) => (typeof val === 'string' ? parseCommaSeparatedNumbers(val) : val),
          z.array(z.number().int().positive()),
        )
        .optional(),
      budgetIds: z
        .preprocess(
          (val) => (typeof val === 'string' ? parseCommaSeparatedNumbers(val) : val),
          z.array(z.number().int().positive()),
        )
        .optional(),
      excludedBudgetIds: z
        .preprocess(
          (val) => (typeof val === 'string' ? parseCommaSeparatedNumbers(val) : val),
          z.array(z.number().int().positive()),
        )
        .optional(),
      tagIds: z
        .preprocess(
          (val) => (typeof val === 'string' ? parseCommaSeparatedNumbers(val) : val),
          z.array(z.number().int().positive()),
        )
        .optional(),
      excludedTagIds: z
        .preprocess(
          (val) => (typeof val === 'string' ? parseCommaSeparatedNumbers(val) : val),
          z.array(z.number().int().positive()),
        )
        .optional(),
      categoryIds: z
        .preprocess(
          (val) => (typeof val === 'string' ? parseCommaSeparatedNumbers(val) : val),
          z.array(z.number().int().positive()),
        )
        .optional(),
      includeSplits: booleanQuery().optional(),
      includeTags: booleanQuery().optional(),
      excludeTransfer: booleanQuery().optional(),
      excludeRefunds: booleanQuery().optional(),
      startDate: z.string().datetime({ message: 'Invalid ISO date string for startDate' }).optional(),
      endDate: z.string().datetime({ message: 'Invalid ISO date string for endDate' }).optional(),
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
});

export default createController(schema, async ({ user, query }) => {
  const { id: userId } = user;

  // Convert decimal amount filters to cents for DB query
  const amountGte = query.amountGte !== undefined ? parseToCents(query.amountGte) : undefined;
  const amountLte = query.amountLte !== undefined ? parseToCents(query.amountLte) : undefined;

  const transactions = await transactionsService.getTransactions({
    ...query,
    amountGte,
    amountLte,
    userId,
  });

  // Serialize: convert cents to decimal for API response
  return { data: serializeTransactions(transactions) };
});
