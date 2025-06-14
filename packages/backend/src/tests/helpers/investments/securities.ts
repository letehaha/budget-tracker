import * as getSecuritiesService from '@root/services/investments/securities/get-all';

import { type MakeRequestReturn, makeRequest } from '../common';

export async function triggerSecuritiesSync<R extends boolean | undefined = false>({
  raw,
}: {
  raw?: R;
} = {}): Promise<MakeRequestReturn<{ message: string }, R>> {
  return makeRequest({
    method: 'post',
    url: '/investments/sync/securities',
    raw,
  });
}
export async function getAllSecurities<R extends boolean | undefined = false>({
  raw,
}: {
  raw?: R;
} = {}) {
  return makeRequest<Awaited<ReturnType<typeof getSecuritiesService.getSecurities>>, R>({
    method: 'get',
    url: '/investments/securities',
    raw,
  });
}
