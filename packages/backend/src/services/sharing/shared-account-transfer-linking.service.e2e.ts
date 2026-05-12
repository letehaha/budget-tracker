import {
  RESOURCE_TYPES,
  SHARE_PERMISSIONS,
  TRANSACTIONS_WRITE_SCOPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

/**
 * Transfer linking on shared accounts. Recipients with `write` may link an existing
 * transaction on a shared account with a transaction they have `write` on (their own
 * account, or another shared account). The `transactionsWriteScope: 'own'` policy still
 * applies to each side of the pair.
 *
 * Pre-fix behavior: `linkTransactions` scoped both the fetch and the update by a single
 * `userId`, so cross-user pairs always failed with `linkUnexpectedError`.
 */

interface RecipientHandle extends helpers.SecondUserHandle {}

async function provisionRecipient(): Promise<RecipientHandle> {
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

interface ShareAccountParams {
  accountId: number;
  recipient: RecipientHandle;
  permission: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
  transactionsWriteScope?: 'own' | 'all';
}

async function shareAccount({
  accountId,
  recipient,
  permission,
  transactionsWriteScope,
}: ShareAccountParams): Promise<void> {
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

describe('Transfer linking on shared accounts', () => {
  it('lets a recipient (write/all) link owner-authored tx on shared account with own tx on own account', async () => {
    // Owner creates an expense on account A.
    const accountOwner = await helpers.createAccount({ raw: true });
    const [ownerExpense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountOwner.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    // Owner shares A with the recipient on write/all.
    const recipient = await provisionRecipient();
    await shareAccount({
      accountId: accountOwner.id,
      recipient,
      permission: SHARE_PERMISSIONS.write,
      transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
    });

    // Recipient creates an income on their own account B.
    const recipientIncome = await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        const accountRecipient = await helpers.createAccount({ raw: true });
        const recipientCategory = await helpers.addCustomCategory({
          name: 'recipient-cat',
          color: '#00FF00',
          raw: true,
        });
        const [tx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountRecipient.id,
            amount: 500,
            transactionType: TRANSACTION_TYPES.income,
            categoryId: recipientCategory.id,
          }),
          raw: true,
        });
        return tx!;
      },
    });

    // Recipient links them.
    const linkResult = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.linkTransactions({
          payload: { ids: [[ownerExpense.id, recipientIncome.id]] },
          raw: true,
        }),
    });

    expect(linkResult).toHaveLength(1);
    const pair = linkResult[0]!;
    const linkedOwnerSide = pair.find((tx) => tx!.id === ownerExpense.id)!;
    const linkedRecipientSide = pair.find((tx) => tx!.id === recipientIncome.id)!;
    expect(linkedOwnerSide.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    expect(linkedRecipientSide.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    expect(linkedOwnerSide.transferId).toEqual(expect.any(String));
    expect(linkedOwnerSide.transferId).toBe(linkedRecipientSide.transferId);
  });

  it('rejects a recipient with read-only permission attempting to link an owner tx', async () => {
    const accountOwner = await helpers.createAccount({ raw: true });
    const [ownerExpense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountOwner.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const recipient = await provisionRecipient();
    await shareAccount({ accountId: accountOwner.id, recipient, permission: SHARE_PERMISSIONS.read });

    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        const accountRecipient = await helpers.createAccount({ raw: true });
        const recipientCategory = await helpers.addCustomCategory({
          name: 'recipient-cat',
          color: '#00FF00',
          raw: true,
        });
        const [recipientIncome] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountRecipient.id,
            amount: 500,
            transactionType: TRANSACTION_TYPES.income,
            categoryId: recipientCategory.id,
          }),
          raw: true,
        });
        return helpers.linkTransactions({
          payload: { ids: [[ownerExpense.id, recipientIncome!.id]] },
        });
      },
    });

    expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('rejects a recipient with write/own scope linking an owner-authored tx they did not create', async () => {
    const accountOwner = await helpers.createAccount({ raw: true });
    const [ownerExpense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountOwner.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const recipient = await provisionRecipient();
    await shareAccount({
      accountId: accountOwner.id,
      recipient,
      permission: SHARE_PERMISSIONS.write,
      transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own,
    });

    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        const accountRecipient = await helpers.createAccount({ raw: true });
        const recipientCategory = await helpers.addCustomCategory({
          name: 'recipient-cat',
          color: '#00FF00',
          raw: true,
        });
        const [recipientIncome] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountRecipient.id,
            amount: 500,
            transactionType: TRANSACTION_TYPES.income,
            categoryId: recipientCategory.id,
          }),
          raw: true,
        });
        return helpers.linkTransactions({
          payload: { ids: [[ownerExpense.id, recipientIncome!.id]] },
        });
      },
    });

    expect(res.statusCode).toBe(ERROR_CODES.Unauthorized);
  });

  it('lets a recipient with write/own scope link their own tx on the shared account with their own tx on their own account', async () => {
    const accountOwner = await helpers.createAccount({ raw: true });
    const ownerCategory = await helpers.addCustomCategory({
      name: 'owner-cat',
      color: '#FF0000',
      raw: true,
    });

    const recipient = await provisionRecipient();
    await shareAccount({
      accountId: accountOwner.id,
      recipient,
      permission: SHARE_PERMISSIONS.write,
      transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own,
    });

    const { sharedAccountTx, ownAccountTx } = await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        // Recipient creates expense on the SHARED account (own authored, using owner's category).
        const [sharedTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountOwner.id,
            amount: 500,
            transactionType: TRANSACTION_TYPES.expense,
            categoryId: ownerCategory.id,
          }),
          raw: true,
        });
        // Recipient creates income on their OWN account (own authored, own category).
        const ownAccount = await helpers.createAccount({ raw: true });
        const ownCategory = await helpers.addCustomCategory({
          name: 'recipient-cat',
          color: '#00FF00',
          raw: true,
        });
        const [ownTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: ownAccount.id,
            amount: 500,
            transactionType: TRANSACTION_TYPES.income,
            categoryId: ownCategory.id,
          }),
          raw: true,
        });
        return { sharedAccountTx: sharedTx!, ownAccountTx: ownTx! };
      },
    });

    const linkResult = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.linkTransactions({
          payload: { ids: [[sharedAccountTx.id, ownAccountTx.id]] },
          raw: true,
        }),
    });

    expect(linkResult).toHaveLength(1);
    const pair = linkResult[0]!;
    pair.forEach((tx) => {
      expect(tx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
      expect(tx!.transferId).toEqual(expect.any(String));
    });
  });

  it('lets a recipient (write/all) update an owner-authored linked transfer tx on the shared account', async () => {
    const accountOwner = await helpers.createAccount({ raw: true });
    const [ownerExpense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountOwner.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const recipient = await provisionRecipient();
    await shareAccount({
      accountId: accountOwner.id,
      recipient,
      permission: SHARE_PERMISSIONS.write,
      transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
    });

    // Recipient links owner's expense with their own income.
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        const accountRecipient = await helpers.createAccount({ raw: true });
        const recipientCategory = await helpers.addCustomCategory({
          name: 'recipient-cat',
          color: '#00FF00',
          raw: true,
        });
        const [recipientIncome] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountRecipient.id,
            amount: 500,
            transactionType: TRANSACTION_TYPES.income,
            categoryId: recipientCategory.id,
          }),
          raw: true,
        });
        return helpers.linkTransactions({
          payload: { ids: [[ownerExpense.id, recipientIncome!.id]] },
          raw: true,
        });
      },
    });

    // Recipient edits the owner-authored linked tx (notes change) on the shared account.
    // Without the `involvesTransfer` guard drop, this is blocked even though all the
    // auth invariants (write/all, owner-set category) are satisfied.
    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.updateTransaction({
          id: ownerExpense.id,
          payload: { note: 'edited by recipient' },
        }),
    });

    expect(res.statusCode).toBe(200);
  });

  it('lets a recipient (write/all) unlink a cross-user transfer they created', async () => {
    const accountOwner = await helpers.createAccount({ raw: true });
    const [ownerExpense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountOwner.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const recipient = await provisionRecipient();
    await shareAccount({
      accountId: accountOwner.id,
      recipient,
      permission: SHARE_PERMISSIONS.write,
      transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
    });

    // Recipient links owner's expense with their own income, then unlinks.
    const { transferId, recipientIncomeId } = await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        const accountRecipient = await helpers.createAccount({ raw: true });
        const recipientCategory = await helpers.addCustomCategory({
          name: 'recipient-cat',
          color: '#00FF00',
          raw: true,
        });
        const [recipientIncome] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountRecipient.id,
            amount: 500,
            transactionType: TRANSACTION_TYPES.income,
            categoryId: recipientCategory.id,
          }),
          raw: true,
        });
        const linkResult = await helpers.linkTransactions({
          payload: { ids: [[ownerExpense.id, recipientIncome!.id]] },
          raw: true,
        });
        return {
          transferId: linkResult[0]![0]!.transferId!,
          recipientIncomeId: recipientIncome!.id,
        };
      },
    });

    const unlinked = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.unlinkTransferTransactions({ transferIds: [transferId], raw: true }),
    });

    expect(unlinked).toHaveLength(2);
    unlinked.forEach((tx) => {
      expect(tx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
      expect(tx.transferId).toBeNull();
    });

    const unlinkedIds = unlinked.map((tx) => tx.id).toSorted();
    expect(unlinkedIds).toEqual([ownerExpense.id, recipientIncomeId].toSorted());
  });

  it('rejects a read-only stranger attempting to unlink a transfer they did not link', async () => {
    // Owner links two of their own txs across two accounts.
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });
    const [expenseA] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountA.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });
    const [incomeB] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountB.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });
    const linkResult = await helpers.linkTransactions({
      payload: { ids: [[expenseA.id, incomeB.id]] },
      raw: true,
    });
    const transferId = linkResult[0]![0]!.transferId!;

    // Stranger (no share at all) attempts to unlink.
    const stranger = await provisionRecipient();
    const res = await helpers.asUser({
      cookies: stranger.cookies,
      fn: () => helpers.unlinkTransferTransactions({ transferIds: [transferId] }),
    });

    expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('lets a recipient (write/all) update their own-authored linked transfer tx on their own account', async () => {
    const accountOwner = await helpers.createAccount({ raw: true });
    const [ownerExpense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountOwner.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const recipient = await provisionRecipient();
    await shareAccount({
      accountId: accountOwner.id,
      recipient,
      permission: SHARE_PERMISSIONS.write,
      transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
    });

    // Recipient links owner's expense with their own income.
    const recipientIncomeId = await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        const accountRecipient = await helpers.createAccount({ raw: true });
        const recipientCategory = await helpers.addCustomCategory({
          name: 'recipient-cat',
          color: '#00FF00',
          raw: true,
        });
        const [recipientIncome] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountRecipient.id,
            amount: 500,
            transactionType: TRANSACTION_TYPES.income,
            categoryId: recipientCategory.id,
          }),
          raw: true,
        });
        await helpers.linkTransactions({
          payload: { ids: [[ownerExpense.id, recipientIncome!.id]] },
          raw: true,
        });
        return recipientIncome!.id;
      },
    });

    // Recipient edits THEIR OWN side. Without the cross-user opposite-tx fix this fails
    // because `updateTransferTransaction` fetches the opposite (owner-authored) by
    // userId=recipient and finds nothing.
    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.updateTransaction({
          id: recipientIncomeId,
          payload: { note: 'edited by recipient on their own side' },
        }),
    });

    expect(res.statusCode).toBe(200);
  });

  it('blocks a recipient explicitly setting transferNature to not_transfer on a linked tx (explicit discard via PATCH)', async () => {
    // Setup mirrors the "edit own side" test — recipient links cross-user, then attempts
    // an explicit discard via PATCH instead of plain field edits. This is the path the
    // narrowed `involvesTransfer` guard is supposed to keep blocking.
    const accountOwner = await helpers.createAccount({ raw: true });
    const [ownerExpense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountOwner.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const recipient = await provisionRecipient();
    await shareAccount({
      accountId: accountOwner.id,
      recipient,
      permission: SHARE_PERMISSIONS.write,
      transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
    });

    await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        const accountRecipient = await helpers.createAccount({ raw: true });
        const recipientCategory = await helpers.addCustomCategory({
          name: 'recipient-cat',
          color: '#00FF00',
          raw: true,
        });
        const [recipientIncome] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: accountRecipient.id,
            amount: 500,
            transactionType: TRANSACTION_TYPES.income,
            categoryId: recipientCategory.id,
          }),
          raw: true,
        });
        await helpers.linkTransactions({
          payload: { ids: [[ownerExpense.id, recipientIncome!.id]] },
          raw: true,
        });
      },
    });

    // Recipient explicitly sets transferNature to not_transfer on the OWNER'S side
    // (where isOwner=false on the base tx's account, so the Phase-1 guard's recipient
    // gate actually fires). PATCH-side discard is still routed through code paths
    // that haven't been fully audited for cross-user safety — keep blocking it.
    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.updateTransaction({
          id: ownerExpense.id,
          payload: { transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer },
        }),
    });

    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});
