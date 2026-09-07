import type { ResourceLease } from '@bt/shared/types';
import { ResourceLeaseType } from '@bt/shared/types';
import { msMoneyUploadCache } from '@services/import-export/ms-money-import/upload-cache';
import { ofxUploadCache } from '@services/import-export/ofx-import/upload-cache';

import type { ResourceLeaseRefresher } from './expiring-upload-cache';

/**
 * Every leasable resource, keyed by the type the client names when it refreshes.
 *
 * The dependency runs one way — this registry knows the features, the features
 * know nothing about it — so a new leased resource is one entry here plus one
 * `ResourceLeaseType` member, with no new endpoint.
 */
const refreshers: Record<ResourceLeaseType, ResourceLeaseRefresher> = {
  [ResourceLeaseType.msMoneyUpload]: msMoneyUploadCache,
  [ResourceLeaseType.ofxUpload]: ofxUploadCache,
};

/**
 * The `type` arrives from a request body and is only ever a key into the map
 * above, so it can never reach a filesystem path or name a resource the server
 * has not registered.
 */
export function refreshResourceLease({
  userId,
  type,
  id,
}: {
  userId: number;
  type: ResourceLeaseType;
  id: string;
}): Promise<ResourceLease> {
  return refreshers[type].refresh({ userId, id });
}
