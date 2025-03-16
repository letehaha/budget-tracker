import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import * as userCurrenciesService from '@services/currencies/add-user-currency';
import { z } from 'zod';

import { errorHandler } from '../helpers';

export const addUserCurrencies = async (req, res: CustomResponse) => {
  try {
    const { id: userId } = req.user;
    const { currencies }: AddUserCurrenciesParams = req.validated.body;

    const result = await userCurrenciesService.addUserCurrencies(currencies.map((item) => ({ userId, ...item })));

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

const recordId = () => z.number().int().positive().finite();
const UserCurrencySchema = z
  .object({
    currencyId: recordId(),
    exchangeRate: z.number().positive().optional(),
    liveRateUpdate: z.boolean().optional(),
  })
  .strict();

const bodyZodSchema = z
  .object({
    currencies: z.array(UserCurrencySchema).nonempty(),
  })
  .strict();

type AddUserCurrenciesParams = z.infer<typeof bodyZodSchema>;

export const addUserCurrenciesSchema = z.object({
  body: bodyZodSchema,
});
