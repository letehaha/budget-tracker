import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { createCallsCounter } from '@tests/mocks/helpers';
import { format } from 'date-fns';

import { API_LAYER_DATE_FORMAT, API_LAYER_ENDPOINT_REGEX } from './fetch-exchange-rates-for-date';

describe('Live exchange rates flows', () => {
  it('uses live exchange rate on acccount creation', async () => {
    const counter = createCallsCounter(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);
    const quoteCurrencyCode = 'UAH';
    const {
      currencies: [userCurrencyUAH],
    } = await helpers.addUserCurrencyByCode({
      code: quoteCurrencyCode,
      raw: true,
    });

    expect(userCurrencyUAH!.liveRateUpdate).toBe(true);

    expect(counter.count).toBe(0);

    const account = await helpers.createAccount({
      payload: {
        ...helpers.buildAccountPayload(),
        currencyCode: userCurrencyUAH!.currencyCode,
      },
      raw: true,
    });

    // On account creation we're getting a first call
    expect(counter.count).toBe(1);
    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
    });

    await helpers.createTransaction({
      payload: txPayload,
      raw: true,
    });

    expect(counter.count).toBe(1);

    const date = format(new Date(), API_LAYER_DATE_FORMAT);

    const response = await helpers.getExchangeRates({ date, raw: true });
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBeGreaterThan(0);

    response.forEach((item) => {
      expect(item).toMatchObject({
        date: expect.stringContaining(date),
      });
    });
  });
});
