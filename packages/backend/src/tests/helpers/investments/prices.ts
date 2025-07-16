import { getPrices } from '@root/services/investments/securities-price/get-prices.service';

import { makeRequest } from '../common';

export async function getSecuritiesPricesByDate<R extends boolean | undefined = false>({
  params = {},
  raw,
}: {
  params?: {
    securityId?: number;
    startDate?: Date;
    endDate?: Date;
  };
  raw?: R;
}) {
  const queryParams: string[] = [];

  if (params.securityId) {
    queryParams.push(`securityId=${params.securityId}`);
  }
  if (params.startDate) {
    queryParams.push(`startDate=${params.startDate.toISOString()}`);
  }
  if (params.endDate) {
    queryParams.push(`endDate=${params.endDate.toISOString()}`);
  }

  const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

  const url = `/investments/prices${queryString}`;

  return makeRequest<Awaited<ReturnType<typeof getPrices>>, R>({
    method: 'get',
    url,
    raw,
  });
}
