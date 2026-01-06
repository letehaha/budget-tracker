import { describe, expect, it } from 'vitest';
import * as helpers from '@tests/helpers';
import { format } from 'date-fns';

import { API_LAYER_DATE_FORMAT } from './fetch-exchange-rates-for-date';

describe('Live exchange rates flows', () => {
  it('uses live exchange rate on account creation', async () => {
    const quoteCurrencyCode = 'UAH';
    const {
      currencies: [userCurrencyUAH],
    } = await helpers.addUserCurrencyByCode({
      code: quoteCurrencyCode,
      raw: true,
    });

    expect(userCurrencyUAH!.liveRateUpdate).toBe(true);

    const account = await helpers.createAccount({
      payload: {
        ...helpers.buildAccountPayload(),
        currencyCode: userCurrencyUAH!.currencyCode,
      },
      raw: true,
    });

    expect(account).toBeDefined();

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
    });

    await helpers.createTransaction({
      payload: txPayload,
      raw: true,
    });

    // Verify exchange rates were fetched and stored
    const date = format(new Date(), API_LAYER_DATE_FORMAT);

    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBeGreaterThan(0);

    response.forEach((item) => {
      expect(item).toMatchObject({
        date: expect.stringContaining(date),
      });
    });
  });
});
