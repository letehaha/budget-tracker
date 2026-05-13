import { API_ERROR_CODES, RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { ErrorResponse } from '@tests/helpers/common';

/**
 * Verifies the active-share guard on `POST /user/currencies/change-base`. Both ends of
 * an accepted share must agree on a base currency; letting either side flip currency
 * after acceptance would silently desync `refAmount` math across users. Pending
 * invitations don't lock — they're handled by the accept-time currency check.
 */
describe('Change Base Currency — active share guard', () => {
  beforeEach(async () => {
    // Both users default to `global.BASE_CURRENCY.code` (set by the integration-test
    // bootstrap), so we don't switch the owner's base in the suite — `provisionSecondUser`
    // will line the recipient up on the same currency, which is what the accept guard
    // needs. We just add a target currency the change-base call can switch *into*.
    await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });
  });

  const callChangeBase = () =>
    helpers.makeRequest({
      method: 'post',
      url: '/user/currencies/change-base',
      payload: { newCurrencyCode: 'USD' },
    });

  it('rejects the change when the caller is the owner of an accepted share', async () => {
    const account = await helpers.createAccount({ raw: true });
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();

    const invitation = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.account,
      resourceId: account.id,
      permission: SHARE_PERMISSIONS.read,
      raw: true,
    });

    const acceptRes = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: invitation.token }),
    });
    expect(acceptRes.statusCode).toBe(200);

    const res = await callChangeBase();

    expect(res.statusCode).toBe(409);
    const err = res.body.response as ErrorResponse;
    expect(err.code).toBe(API_ERROR_CODES.baseCurrencyLockedByShares);
  });

  it('rejects the change when the caller is the recipient of an accepted share', async () => {
    const account = await helpers.createAccount({ raw: true });
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();

    const invitation = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.account,
      resourceId: account.id,
      permission: SHARE_PERMISSIONS.read,
      raw: true,
    });

    const acceptRes = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: invitation.token }),
    });
    expect(acceptRes.statusCode).toBe(200);

    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        // Mirror the owner's currency setup so the only thing standing between the
        // recipient and a successful change-base is the share guard itself.
        await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });
        return callChangeBase();
      },
    });

    expect(res.statusCode).toBe(409);
    const err = res.body.response as ErrorResponse;
    expect(err.code).toBe(API_ERROR_CODES.baseCurrencyLockedByShares);
  });

  it('allows the change when only a pending (not-yet-accepted) invitation exists', async () => {
    const account = await helpers.createAccount({ raw: true });
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();

    await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.account,
      resourceId: account.id,
      permission: SHARE_PERMISSIONS.read,
      raw: true,
    });

    const res = await callChangeBase();

    expect(res.statusCode).toBe(200);
  });

  it('allows the change when the user has no shares at all', async () => {
    const res = await callChangeBase();

    expect(res.statusCode).toBe(200);
  });
});
