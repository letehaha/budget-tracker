import { currencyCode } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { ValidationError } from '@js/errors';
import { changeBaseCurrency } from '@root/services/currencies/change-base-currency.service';
import { exchangeRateProviderRegistry } from '@services/exchange-rates/providers';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    newCurrencyCode: currencyCode(),
  }),
});

export default createController(schema, async ({ user, body }) => {
  // Validate that the currency is supported by providers that handle historical data
  if (!exchangeRateProviderRegistry.isCurrencySupportedForHistoricalData(body.newCurrencyCode)) {
    const supportedCurrencies = exchangeRateProviderRegistry.getSupportedCurrenciesForHistoricalData();
    throw new ValidationError({
      message: `Changing base currency to ${body.newCurrencyCode} is not supported. Only these currencies are supported: ${supportedCurrencies.join(', ')}.`,
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
