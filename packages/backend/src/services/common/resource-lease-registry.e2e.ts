import { ResourceLeaseType } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { asUser, provisionSecondUserWithBaseCurrency, withoutSession } from '@tests/helpers/share';
import { randomUUID } from 'node:crypto';

/**
 * Contract tests for the one endpoint that refreshes every leased resource.
 * Nothing here mints a real lease — the behaviour of a live one is covered
 * where the resource lives, e.g. `ms-money-upload-lease.e2e.ts`.
 */

/** A well-formed lease id that was never issued. */
const unknownLeaseId = () => randomUUID();

describe('POST /resource-leases/refresh', () => {
  it('returns 404 for an id that was never issued', async () => {
    const response = await helpers.refreshResourceLease({
      payload: { type: ResourceLeaseType.msMoneyUpload, id: unknownLeaseId() },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('rejects an id that is not a UUID', async () => {
    const response = await helpers.refreshResourceLease({
      payload: { type: ResourceLeaseType.msMoneyUpload, id: '../../etc/passwd' },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('rejects a resource type the server does not know', async () => {
    const response = await helpers.refreshResourceLease({
      payload: { type: 'not-a-leased-resource', id: unknownLeaseId() },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  /**
   * A lease is scoped to its owner, and a second user must not be able to tell
   * an id that is not theirs apart from one that never existed.
   */
  it("answers another user's id the same way as an unknown one", async () => {
    const otherUser = await provisionSecondUserWithBaseCurrency();
    const id = unknownLeaseId();

    await asUser({
      cookies: otherUser.cookies,
      fn: async () => {
        const response = await helpers.refreshResourceLease({
          payload: { type: ResourceLeaseType.msMoneyUpload, id },
        });

        expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
      },
    });
  });

  it('rejects an unauthenticated refresh', async () => {
    const response = await withoutSession(() =>
      helpers.refreshResourceLease({
        payload: { type: ResourceLeaseType.msMoneyUpload, id: unknownLeaseId() },
      }),
    );

    expect(response.statusCode).toBe(ERROR_CODES.Unauthorized);
  });
});
