import { ACCOUNT_TYPES, SORT_DIRECTIONS, TRANSACTION_TYPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
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
      categoryIds: z
        .preprocess(
          (val) => (typeof val === 'string' ? parseCommaSeparatedNumbers(val) : val),
          z.array(z.number().int().positive()),
        )
        .optional(),
      includeUser: z.preprocess((val) => val === 'true', z.boolean()).optional(),
      includeAccount: z.preprocess((val) => val === 'true', z.boolean()).optional(),
      includeCategory: z.preprocess((val) => val === 'true', z.boolean()).optional(),
      includeAll: z.preprocess((val) => val === 'true', z.boolean()).optional(),
      nestedInclude: z.preprocess((val) => val === 'true', z.boolean()).optional(),
      excludeTransfer: z.preprocess((val) => val === 'true', z.boolean()).optional(),
      excludeRefunds: z.preprocess((val) => val === 'true', z.boolean()).optional(),
      startDate: z.string().datetime({ message: 'Invalid ISO date string for startDate' }).optional(),
      endDate: z.string().datetime({ message: 'Invalid ISO date string for endDate' }).optional(),
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

  const data = await transactionsService.getTransactions({
    ...query,
    userId,
  });

  return { data };
});
