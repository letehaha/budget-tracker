import { api } from '@/api/_api';
import type { RefreshResourceLeaseRequest, RefreshResourceLeaseResponse } from '@bt/shared/types';

/**
 * Extends the expiry of any leased server-side resource. Runs as a background
 * heartbeat, so it is `silent` — a transient failure must not raise a toast the
 * user cannot act on; the caller decides what a missing lease means.
 */
export const refreshResourceLease = async ({
  type,
  id,
}: RefreshResourceLeaseRequest): Promise<RefreshResourceLeaseResponse> =>
  api.post('/resource-leases/refresh', { type, id }, { silent: true });
