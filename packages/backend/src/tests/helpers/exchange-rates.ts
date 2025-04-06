import { editUserExchangeRates } from '@root/services/user-exchange-rate';

import { makeRequest } from './common';

type ExchangeRatePair = {
  baseCode: string;
  quoteCode: string;
  rate: number;
};

export async function editCurrencyExchangeRate<R extends boolean | undefined = undefined>({
  pairs,
  raw,
}: {
  pairs: ExchangeRatePair[];
  raw?: R;
}) {
  const result = await makeRequest<Awaited<ReturnType<typeof editUserExchangeRates>>, R>({
    method: 'put',
    url: '/user/currency/rates',
    payload: { pairs },
    raw,
  });

  return result;
}

export async function getExchangeRates<R extends boolean | undefined = undefined>({
  date,
  raw,
}: {
  date: string; // yyyy-mm-dd
  raw?: R;
}) {
  const response = await makeRequest({
    method: 'get',
    url: `/currencies/rates/${date}`,
    raw,
  });

  return response;
}

export async function syncExchangeRates() {
  return makeRequest<void>({
    url: '/tests/exchange-rates/sync',
    method: 'get',
  });
}
