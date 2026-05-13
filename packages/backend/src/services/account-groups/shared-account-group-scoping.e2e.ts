import { RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import * as helpers from '@tests/helpers';

/**
 * Recipient-side grouping of shared accounts (F7 — Settings tab → Account group).
 *
 * Each side organizes their own account list independently. The `AccountGroupings`
 * many-to-many table already supports multiple `(accountId, groupId)` rows per account
 * (one per user, since each `AccountGroup.userId` is per-user). These tests prove that:
 *
 *   1. A recipient can attach a shared account to their own group.
 *   2. Doing so does NOT remove the owner's grouping for the same account.
 *   3. Attempting to write to another user's grouping returns 404.
 */
describe('Account group scoping with shared accounts', () => {
  async function provisionRecipient(): Promise<helpers.SecondUserHandle> {
    const handle = await helpers.signUpSecondUser();
    await helpers.asUser({
      cookies: handle.cookies,
      fn: async () => {
        const res = await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY.code });
        if (res.statusCode !== 200) {
          throw new Error(`Failed to set base currency: ${res.statusCode} ${JSON.stringify(res.body)}`);
        }
      },
    });
    return handle;
  }

  async function shareWithRecipient({
    accountId,
    recipient,
  }: {
    accountId: number;
    recipient: helpers.SecondUserHandle;
  }) {
    const invitation = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.account,
      resourceId: accountId,
      permission: SHARE_PERMISSIONS.read,
      raw: true,
    });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
    });
  }

  it("recipient can group a shared account into their own group without touching the owner's grouping", async () => {
    const account = await helpers.createAccount({ raw: true });
    const ownerGroup = await helpers.createAccountGroup({ name: 'owner-group', raw: true });
    await helpers.addAccountToGroup({ accountId: account.id, groupId: ownerGroup.id });

    const recipient = await provisionRecipient();
    await shareWithRecipient({ accountId: account.id, recipient });

    const recipientGroup = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.createAccountGroup({ name: 'recipient-group', raw: true }),
    });

    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.addAccountToGroup({
          accountId: account.id,
          groupId: recipientGroup.id,
        }),
    });

    expect(res.statusCode).toBe(200);

    const groupings = await AccountGrouping.findAll({ where: { accountId: account.id } });
    expect(groupings).toHaveLength(2);
    const groupIds = groupings.map((g) => g.groupId).sort((a, b) => a - b);
    expect(groupIds).toEqual([ownerGroup.id, recipientGroup.id].sort((a, b) => a - b));
  });

  it('non-recipient who is also not the owner gets 404 when trying to group a foreign account', async () => {
    const account = await helpers.createAccount({ raw: true });
    const stranger = await provisionRecipient();
    const strangerGroup = await helpers.asUser({
      cookies: stranger.cookies,
      fn: () => helpers.createAccountGroup({ name: 'stranger-group', raw: true }),
    });

    const res = await helpers.asUser({
      cookies: stranger.cookies,
      fn: () =>
        helpers.addAccountToGroup({
          accountId: account.id,
          groupId: strangerGroup.id,
        }),
    });

    expect(res.statusCode).toBe(404);
  });

  it("recipient removing their grouping leaves the owner's grouping intact", async () => {
    const account = await helpers.createAccount({ raw: true });
    const ownerGroup = await helpers.createAccountGroup({ name: 'owner-group', raw: true });
    await helpers.addAccountToGroup({ accountId: account.id, groupId: ownerGroup.id });

    const recipient = await provisionRecipient();
    await shareWithRecipient({ accountId: account.id, recipient });

    const recipientGroup = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.createAccountGroup({ name: 'recipient-group', raw: true }),
    });

    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.addAccountToGroup({ accountId: account.id, groupId: recipientGroup.id }),
    });

    const removeRes = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.removeAccountFromGroup({
          accountIds: [account.id],
          groupId: recipientGroup.id,
        }),
    });

    expect(removeRes.statusCode).toBe(200);

    const remaining = await AccountGrouping.findAll({ where: { accountId: account.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.groupId).toBe(ownerGroup.id);
  });
});
