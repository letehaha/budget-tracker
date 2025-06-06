import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as userCurrenciesService from '@services/currencies/add-user-currency';
import { z } from 'zod';

const UserCurrencySchema = z
  .object({
    currencyId: recordId(),
    exchangeRate: z.number().positive().optional(),
    liveRateUpdate: z.boolean().optional(),
  })
  .strict();

const schema = z.object({
  body: z
    .object({
      currencies: z.array(UserCurrencySchema).nonempty(),
    })
    .strict(),
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { currencies } = body;

  const data = await userCurrenciesService.addUserCurrencies(currencies.map((item) => ({ userId, ...item })));

  return { data };
});
