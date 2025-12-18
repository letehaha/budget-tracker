import { BalanceModel } from '@bt/shared/types';
import { getCombinedBalanceHistory as _getCombinedBalanceHistory } from '@root/services/stats';
import * as helpers from '@tests/helpers';

export async function getBalanceHistory<R extends boolean | undefined = undefined>({
  from,
  to,
  accountId,
  raw,
}: {
  from?: string;
  to?: string;
  accountId?: number;
  raw?: R;
} = {}) {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  if (accountId) params.append('accountId', accountId.toString());

  const result = await helpers.makeRequest<BalanceModel[], R>({
    method: 'get',
    url: `/stats/balance-history${params.toString() ? `?${params.toString()}` : ''}`,
    raw,
  });

  return result;
}

export const getSpendingsByCategories = async ({ raw = false }: { raw?: boolean } = {}) => {
  const result = await helpers.makeRequest({
    method: 'get',
    url: '/stats/spendings-by-categories',
  });

  return raw ? helpers.extractResponse(result) : result;
};

export async function getCombinedBalanceHistory<R extends boolean | undefined = undefined>({
  from,
  to,
  raw,
}: {
  from?: string;
  to?: string;
  raw?: R;
}) {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);

  const result = await helpers.makeRequest<Awaited<ReturnType<typeof _getCombinedBalanceHistory>>, R>({
    method: 'get',
    url: `/stats/combined-balance-history${params.toString() ? `?${params.toString()}` : ''}`,
    raw,
  });

  return result;
}
