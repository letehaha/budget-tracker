import { api } from '@/api/_api';
import {
  RESOURCE_LEASE_REFRESH_INTERVAL_MS,
  type RefreshResourceLeaseRequest,
  type RefreshResourceLeaseResponse,
} from '@bt/shared/types';

/**
 * Half a beat. A request that never settles (hung proxy, stalled response) must
 * fail before the next beat is due — the caller's heartbeat waits on this promise,
 * so without a deadline one bad request freezes it and the lease dies unnoticed.
 */
const REFRESH_TIMEOUT_MS = RESOURCE_LEASE_REFRESH_INTERVAL_MS / 2;

/**
 * Extends the expiry of any leased server-side resource. Runs as a background
 * heartbeat, so it is `silent` — a transient failure must not raise a toast the
 * user cannot act on; the caller decides what a missing lease means.
 */
export const refreshResourceLease = async ({
  type,
  id,
}: RefreshResourceLeaseRequest): Promise<RefreshResourceLeaseResponse> =>
  api.post('/resource-leases/refresh', { type, id }, { silent: true, signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS) });
