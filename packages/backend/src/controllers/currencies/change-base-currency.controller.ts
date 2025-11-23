import { currencyCode } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { ValidationError } from '@js/errors';
import { changeBaseCurrency } from '@root/services/currencies/change-base-currency.service';
import {
  FRANKFURTER_SUPPORTED_CURRENCIES,
  isSupportedByFrankfurter,
} from '@services/exchange-rates/frankfurter.service';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    newCurrencyCode: currencyCode(),
  }),
});

export default createController(schema, async ({ user, body }) => {
  // Validate that the currency is supported by Frankfurter
  if (!isSupportedByFrankfurter(body.newCurrencyCode)) {
    throw new ValidationError({
      message: `For now, changing base currency to ${body.newCurrencyCode} is not supported. Only these currencies are supported: ${FRANKFURTER_SUPPORTED_CURRENCIES.join(', ')}.`,
    });
  }

  const result = await changeBaseCurrency({
    userId: user.id,
    newCurrencyCode: body.newCurrencyCode,
  });

  return {
    data: result,
    statusCode: 200,
  };
});
