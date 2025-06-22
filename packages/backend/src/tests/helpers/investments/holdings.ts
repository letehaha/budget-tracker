import * as holdingsService from '@services/investments/holdings';
import { makeRequest } from '@tests/helpers';

export async function createHolding<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: Omit<Parameters<typeof holdingsService.createHolding>[0], 'userId'>;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof holdingsService.createHolding>>, R>({
    method: 'post',
    url: '/investments/holding',
    payload,
    raw,
  });
}

export async function deleteHolding<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: Omit<Parameters<typeof holdingsService.deleteHolding>[0], 'userId'>;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof holdingsService.deleteHolding>>, R>({
    method: 'delete',
    url: '/investments/holding',
    payload,
    raw,
  });
}
