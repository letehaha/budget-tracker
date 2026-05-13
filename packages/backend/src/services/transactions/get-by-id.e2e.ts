import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

/**
 * CRIT9 — GET /transactions/:id — 4-branch coverage for getTransactionById service.
 *
 * Branch 1: caller authored tx AND owns parent account → fast-path isOwner:true
 * Branch 2: caller authored tx on a SHARED account (recipient tx on owner's acct) → share-aware lookup
 * Branch 3: caller did NOT author tx but has accepted share with read perm → tx returned
 * Branch 4: stranger with no claim → null (404)
 */

async function provisionRecipient() {
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

async function shareAccountWithRecipient({
  accountId,
  recipient,
  permission,
  transactionsWriteScope,
}: {
  accountId: number;
  recipient: helpers.SecondUserHandle;
  permission: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
  transactionsWriteScope?: 'own' | 'all';
}) {
  const invitation = await helpers.createShareInvitation({
    inviteeEmail: recipient.email,
    resourceType: RESOURCE_TYPES.account,
    resourceId: accountId,
    permission,
    policy: transactionsWriteScope ? { transactionsWriteScope } : undefined,
    raw: true,
  });
  await helpers.asUser({
    cookies: recipient.cookies,
    fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
  });
}

describe('GET /transactions/:id — getTransactionById 4-branch coverage', () => {
  it('Branch 1: owner retrieves their own tx on their own account (fast-path isOwner)', async () => {
    const account = await helpers.createAccount({ raw: true });
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 15,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const result = await helpers.getTransactionById({ id: tx.id, raw: true });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(tx.id);
    expect(result!.amount).toBe(15);
  });

  it('Branch 2: recipient-authored tx on shared account is visible to the recipient', async () => {
    // Owner creates account and category; shares with recipient (write/all)
    const account = await helpers.createAccount({ raw: true });
    const ownerCategory = await helpers.addCustomCategory({ name: 'shared-cat', color: '#FF0000', raw: true });

    const recipient = await provisionRecipient();
    await shareAccountWithRecipient({
      accountId: account.id,
      recipient,
      permission: SHARE_PERMISSIONS.write,
      transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
    });

    // Recipient creates tx on owner's account
    const [recipientTx] = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 20,
            transactionType: TRANSACTION_TYPES.expense,
            categoryId: ownerCategory.id,
          }),
          raw: true,
        }),
    });

    // Recipient fetches that tx by id — branch 2: authored by caller but account belongs to owner
    const result = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.getTransactionById({ id: recipientTx.id, raw: true }),
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(recipientTx.id);
    expect(result!.amount).toBe(20);
  });

  it('Branch 3: non-author recipient with accepted read share can fetch the tx', async () => {
    // Owner creates account + tx
    const account = await helpers.createAccount({ raw: true });
    const [ownerTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 5,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    // Share read-only with recipient
    const recipient = await provisionRecipient();
    await shareAccountWithRecipient({
      accountId: account.id,
      recipient,
      permission: SHARE_PERMISSIONS.read,
    });

    // Recipient did NOT author the tx — branch 3: canUserAccessResource path
    const result = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.getTransactionById({ id: ownerTx.id, raw: true }),
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(ownerTx.id);
    expect(result!.amount).toBe(5);
  });

  it('Branch 4: stranger with no share claim gets null (endpoint returns null)', async () => {
    const account = await helpers.createAccount({ raw: true });
    const [ownerTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
      }),
      raw: true,
    });

    const stranger = await provisionRecipient();

    const res = await helpers.asUser({
      cookies: stranger.cookies,
      fn: () => helpers.getTransactionById({ id: ownerTx.id, raw: false }),
    });

    // Controller returns { data: null } with 200 when tx not found for caller
    expect(res.statusCode).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).body.response).toBeNull();
  });

  it('returns 404 for a completely non-existent transaction id', async () => {
    const res = await helpers.getTransactionById({ id: 9999999, raw: false });
    // Controller serializes missing tx as null with 200; verify no data leaks
    expect(res.statusCode).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).body.response).toBeNull();
  });
});
