import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

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
  accountId: string;
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
    const res = await helpers.getTransactionById({ id: generateRandomRecordId(), raw: false });
    // Controller serializes missing tx as null with 200; verify no data leaks
    expect(res.statusCode).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).body.response).toBeNull();
  });
});

describe('GET /transactions/:id — canEdit flag', () => {
  // The single-tx endpoint surfaces `canEdit` from the already-resolved access result —
  // no extra DB cost. The FE uses it as the authoritative write-access signal when the
  // parent account isn't in its local store (typically a budget-share-only fetch).
  it('owner gets canEdit: true on their own tx', async () => {
    const account = await helpers.createAccount({ raw: true });
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 15 }),
      raw: true,
    });

    const result = await helpers.getTransactionById({ id: tx.id, raw: true });
    expect(result!.canEdit).toBe(true);
  });

  it('write/all recipient on a shared account gets canEdit: true', async () => {
    const account = await helpers.createAccount({ raw: true });
    const [ownerTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 30 }),
      raw: true,
    });
    const recipient = await provisionRecipient();
    await shareAccountWithRecipient({
      accountId: account.id,
      recipient,
      permission: SHARE_PERMISSIONS.write,
      transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
    });

    const result = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.getTransactionById({ id: ownerTx.id, raw: true }),
    });
    expect(result!.canEdit).toBe(true);
  });

  it('read-only recipient on a shared account gets canEdit: false', async () => {
    const account = await helpers.createAccount({ raw: true });
    const [ownerTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 5 }),
      raw: true,
    });
    const recipient = await provisionRecipient();
    await shareAccountWithRecipient({
      accountId: account.id,
      recipient,
      permission: SHARE_PERMISSIONS.read,
    });

    const result = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.getTransactionById({ id: ownerTx.id, raw: true }),
    });
    expect(result!.canEdit).toBe(false);
  });

  it("'own'-scope recipient gets canEdit: false on owner's tx, true on their own", async () => {
    const account = await helpers.createAccount({ raw: true });
    const [ownerTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
      raw: true,
    });
    const recipient = await provisionRecipient();
    await shareAccountWithRecipient({
      accountId: account.id,
      recipient,
      permission: SHARE_PERMISSIONS.write,
      transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own,
    });

    const [recipientTx] = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 25 }),
          raw: true,
        }),
    });

    const ownerView = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.getTransactionById({ id: ownerTx.id, raw: true }),
    });
    expect(ownerView!.canEdit).toBe(false);

    const ownView = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.getTransactionById({ id: recipientTx.id, raw: true }),
    });
    expect(ownView!.canEdit).toBe(true);
  });
});

describe('GET /transactions/:id — budget-share visibility fallback', () => {
  // Detail endpoint must match list visibility: a budget-share recipient sees owner-
  // attached rows in the budget list, so the detail lookup for the same id should also
  // return the row (with `canEdit: false`). Otherwise the FE edit-dialog's lazy probe
  // reads a null detail response as "unknown" and unlocks the form.
  async function shareBudgetWithRecipient({
    budgetId,
    recipient,
    permission,
  }: {
    budgetId: string;
    recipient: helpers.SecondUserHandle;
    permission: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
  }) {
    const invitation = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.budget,
      resourceId: budgetId,
      permission,
      raw: true,
    });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
    });
  }

  it('budget-share recipient fetches owner-tx in the budget → tx returned with canEdit: false', async () => {
    const account = await helpers.createAccount({ raw: true });
    const [ownerTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 42 }),
      raw: true,
    });
    const budget = await helpers.createCustomBudget({ name: 'budget-visibility', raw: true });
    await helpers.addTransactionToCustomBudget({
      id: budget.id,
      payload: { transactionIds: [ownerTx!.id] },
      raw: true,
    });
    const recipient = await provisionRecipient();
    await shareBudgetWithRecipient({
      budgetId: budget.id,
      recipient,
      permission: SHARE_PERMISSIONS.manage,
    });

    const result = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.getTransactionById({ id: ownerTx!.id, raw: true }),
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(ownerTx!.id);
    expect(result!.canEdit).toBe(false);
  });

  it('non-recipient still gets null when tx is not in any budget they can see', async () => {
    const account = await helpers.createAccount({ raw: true });
    const [ownerTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 42 }),
      raw: true,
    });
    const budget = await helpers.createCustomBudget({ name: 'private-budget', raw: true });
    await helpers.addTransactionToCustomBudget({
      id: budget.id,
      payload: { transactionIds: [ownerTx!.id] },
      raw: true,
    });
    // Stranger has no budget share + no account share — fallback must stay null.
    const stranger = await provisionRecipient();

    const res = await helpers.asUser({
      cookies: stranger.cookies,
      fn: () => helpers.getTransactionById({ id: ownerTx!.id, raw: false }),
    });

    expect(res.statusCode).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).body.response).toBeNull();
  });

  it('budget-share recipient still 403s on PUT /transactions/:id for the same tx', async () => {
    // Detail endpoint widening must NOT change write semantics — recipient can read,
    // not write. This is the original bug; lock it down.
    const account = await helpers.createAccount({ raw: true });
    const [ownerTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 42 }),
      raw: true,
    });
    const budget = await helpers.createCustomBudget({ name: 'budget-write-block', raw: true });
    await helpers.addTransactionToCustomBudget({
      id: budget.id,
      payload: { transactionIds: [ownerTx!.id] },
      raw: true,
    });
    const recipient = await provisionRecipient();
    await shareBudgetWithRecipient({
      budgetId: budget.id,
      recipient,
      permission: SHARE_PERMISSIONS.manage,
    });

    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.updateTransaction({ id: ownerTx!.id, payload: { amount: 999 } }),
    });

    expect(res.statusCode).toBe(403);
  });
});
