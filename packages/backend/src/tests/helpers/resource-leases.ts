import type { RefreshResourceLeaseResponse } from '@bt/shared/types';

import { type UtilizeReturnType, makeRequest } from './common';

/**
 * One endpoint serves every leased resource, so `type` is typed as a plain
 * string — tests need to send values the enum does not carry to prove an
 * unregistered kind is refused.
 */
export function refreshResourceLease<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: { type: string; id: string };
  raw?: R;
}): UtilizeReturnType<() => RefreshResourceLeaseResponse, R> {
  return makeRequest<RefreshResourceLeaseResponse, R>({
    method: 'post',
    url: '/resource-leases/refresh',
    payload,
    raw,
  });
}
