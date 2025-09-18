import * as helpers from '@tests/helpers';

export const getSpendingsByCategories = async ({ raw = false }: { raw?: boolean } = {}) => {
  const result = await helpers.makeRequest({
    method: 'get',
    url: '/stats/spendings-by-categories',
  });

  return raw ? helpers.extractResponse(result) : result;
};

export const getCombinedBalanceHistory = async ({
  from,
  to,
  raw = false,
}: {
  from?: string;
  to?: string;
  raw?: boolean;
} = {}) => {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);

  const result = await helpers.makeRequest({
    method: 'get',
    url: `/stats/combined-balance-history${params.toString() ? `?${params.toString()}` : ''}`,
  });

  return raw ? helpers.extractResponse(result) : result;
};
