import { SHARE_PERMISSIONS } from '@bt/shared/types';
import { afterEach, describe, expect, it } from '@jest/globals';
import { UnexpectedError } from '@js/errors';

import { canUserAccessResource } from './can-user-access-resource.service';

/**
 * Outside production we want a thrown `UnexpectedError` for unknown `resourceType` so
 * the misconfiguration surfaces in CI / dev instead of silently log-then-deny.
 *
 * Test bypasses the `ResourceType` union by casting — the compile-time exhaustiveness
 * already prevents this in normal code, so the runtime guard is a defensive backstop
 * for unsafe casts at the boundary (e.g., free-form `resourceType` strings from
 * incoming requests).
 */

describe('canUserAccessResource — unknown resourceType', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('throws UnexpectedError when NODE_ENV is not production', async () => {
    process.env.NODE_ENV = 'test';
    await expect(
      canUserAccessResource({
        userId: 1,
        resourceType: 'definitely-not-a-real-type' as never,
        resourceId: 1,
        requiredPermission: SHARE_PERMISSIONS.read,
      }),
    ).rejects.toBeInstanceOf(UnexpectedError);
  });

  it('logs and denies in production rather than throwing', async () => {
    process.env.NODE_ENV = 'production';
    const result = await canUserAccessResource({
      userId: 1,
      resourceType: 'definitely-not-a-real-type' as never,
      resourceId: 1,
      requiredPermission: SHARE_PERMISSIONS.read,
    });
    expect(result.granted).toBe(false);
    expect(result.ownerUserId).toBeNull();
  });
});
