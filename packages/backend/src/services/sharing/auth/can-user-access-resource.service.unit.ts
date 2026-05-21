import { SHARE_PERMISSIONS } from '@bt/shared/types';
import { afterEach, describe, expect, it } from '@jest/globals';
import { UnexpectedError } from '@js/errors';

import { canUserAccessResource } from './can-user-access-resource.service';

/**
 * Unknown `resourceType` always throws `UnexpectedError` — `resourceType` reaches this
 * function only after Zod-validation against the enum, so a missing resolver always
 * means a code bug (never user input). A clear 500 is more actionable than silently
 * denying access (which would manifest as a confusing 404 to the resource owner).
 *
 * Test bypasses the `ResourceType` union by casting — the compile-time exhaustiveness
 * already prevents this in normal code, so the runtime guard is a defensive backstop
 * for unsafe casts at the boundary.
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

  it('throws UnexpectedError in production as well', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      canUserAccessResource({
        userId: 1,
        resourceType: 'definitely-not-a-real-type' as never,
        resourceId: 1,
        requiredPermission: SHARE_PERMISSIONS.read,
      }),
    ).rejects.toBeInstanceOf(UnexpectedError);
  });
});
