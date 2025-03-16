import { ACCOUNT_TYPES, API_RESPONSE_STATUS, SORT_DIRECTIONS, TRANSACTION_TYPES } from '@bt/shared/types';
import { CustomRequest, CustomResponse } from '@common/types';
import * as transactionsService from '@services/transactions';
import { z } from 'zod';

import { errorHandler } from '../helpers';

export const getTransactions = async (req, res: CustomResponse) => {
  try {
    const { id: userId } = (req as CustomRequest<typeof getTransactionsSchema>).user;
    const { ...restParams } = (req as CustomRequest<typeof getTransactionsSchema>).validated.query;

    const data = await transactionsService.getTransactions({
      ...restParams,
      userId,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    console.log('err', err);
    errorHandler(res, err as Error);
  }
};

const parseCommaSeparatedNumbers = (value: string) =>
  value
    .split(',')
    .map(Number)
    .filter((n) => !isNaN(n));

export const getTransactionsSchema = z.object({
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
