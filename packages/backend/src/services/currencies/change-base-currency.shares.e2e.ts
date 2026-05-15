import { API_ERROR_CODES, RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import ResourceShares from '@models/resource-shares.model';
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

  it('rejects with BASE_CURRENCY_LOCKED_BY_HOUSEHOLD when an active household membership blocks', async () => {
    // Seed an accepted household row where caller is the owner. Household rows are
    // user-scoped, not account-scoped — one membership blocks regardless of how many
    // accounts the user owns.
    const account = await helpers.createAccount({ raw: true });
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();
    const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

    await ResourceShares.create({
      ownerUserId: account.userId,
      sharedWithUserId: recipientApp.id,
      resourceType: RESOURCE_TYPES.household,
      resourceId: String(account.userId),
      permission: SHARE_PERMISSIONS.write,
      acceptedAt: new Date(),
    });

    const res = await callChangeBase();

    expect(res.statusCode).toBe(409);
    const err = res.body.response as ErrorResponse & {
      details?: { blockers?: Array<{ type: string; count: number }> };
    };
    expect(err.code).toBe(API_ERROR_CODES.baseCurrencyLockedByHousehold);
    expect(err.details?.blockers).toEqual(expect.arrayContaining([{ type: 'household', count: 1 }]));
  });

  it('surfaces both blocker types in details when household and per-resource shares both block', async () => {
    const account = await helpers.createAccount({ raw: true });
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();
    const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

    // Accepted household row.
    await ResourceShares.create({
      ownerUserId: account.userId,
      sharedWithUserId: recipientApp.id,
      resourceType: RESOURCE_TYPES.household,
      resourceId: String(account.userId),
      permission: SHARE_PERMISSIONS.write,
      acceptedAt: new Date(),
    });
    // Accepted per-resource share to a different user — same owner can still have both
    // a household member and a per-account share (different recipients). Provision a
    // third user to receive the per-resource share so the per-resource count is 1.
    const otherRecipient = await helpers.provisionSecondUserWithBaseCurrency({
      email: `other-${Date.now()}@test.local`,
    });
    const otherRecipientApp = await helpers.findAppUserByEmail({ email: otherRecipient.email });
    await ResourceShares.create({
      ownerUserId: account.userId,
      sharedWithUserId: otherRecipientApp.id,
      resourceType: RESOURCE_TYPES.account,
      resourceId: String(account.id),
      permission: SHARE_PERMISSIONS.read,
      acceptedAt: new Date(),
    });

    const res = await callChangeBase();

    expect(res.statusCode).toBe(409);
    const err = res.body.response as ErrorResponse & {
      details?: { blockers?: Array<{ type: string; count: number }> };
    };
    // Household takes the primary code when both are present.
    expect(err.code).toBe(API_ERROR_CODES.baseCurrencyLockedByHousehold);
    expect(err.details?.blockers).toEqual(
      expect.arrayContaining([
        { type: 'household', count: 1 },
        { type: 'share', count: 1 },
      ]),
    );
  });

  it('rejects the change when the caller is the recipient of an accepted household membership', async () => {
    // Mirror of the owner-side household lock test. The query uses
    // `Op.or [ownerUserId, sharedWithUserId]` so both sides of the membership are
    // blocked; without this test a regression that dropped the `sharedWithUserId`
    // clause would only be caught for owners.
    const owner = await helpers.createAccount({ raw: true });
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();
    const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

    await ResourceShares.create({
      ownerUserId: owner.userId,
      sharedWithUserId: recipientApp.id,
      resourceType: RESOURCE_TYPES.household,
      resourceId: String(owner.userId),
      permission: SHARE_PERMISSIONS.write,
      acceptedAt: new Date(),
    });

    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        // Recipient also needs USD available before they can try to change base into it.
        await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });
        return callChangeBase();
      },
    });

    expect(res.statusCode).toBe(409);
    const err = res.body.response as ErrorResponse & {
      details?: { blockers?: Array<{ type: string; count: number }> };
    };
    expect(err.code).toBe(API_ERROR_CODES.baseCurrencyLockedByHousehold);
    expect(err.details?.blockers).toEqual(expect.arrayContaining([{ type: 'household', count: 1 }]));
  });
});
