import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

/**
 * S4 — Write paths on shared accounts. Covers create/update/delete authorization on
 * shared accounts plus the `transactionsWriteScope: 'own' | 'all'` policy enforcement,
 * plus the categories `?accountId=` routing introduced for the picker side of the same
 * slice. See `docs/prds/family-sharing.md` (F3, F4) and `docs/prds/family-sharing-categories.md`.
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
  accountId: string;
  recipient: RecipientHandle;
  permission: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
  transactionsWriteScope?: 'own' | 'all';
}

/** Owner-side: create + auto-accept by recipient. Requires owner cookies in `global.APP_AUTH_COOKIES`. */
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

/** Owner creates a category that the recipient should NOT be able to use on their own accounts. */
async function ownerCreatesCategory(name: string) {
  return helpers.addCustomCategory({ name, color: '#FF0000', raw: true });
}

describe('Shared account writes — S4', () => {
  describe('POST /transactions on a shared account', () => {
    it('allows a recipient with write/all to create a transaction with the owner category', async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Groceries (owner)');
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 1234,
              transactionType: TRANSACTION_TYPES.expense,
              categoryId: ownerCategory.id,
            }),
          }),
      });

      expect(res.statusCode).toBe(200);
    });

    it('rejects a recipient supplying their own categoryId on a shared account (must be owner-set)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      // Recipient creates a category on *their own* side.
      const recipientCategory = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.addCustomCategory({ name: 'recipient-side', color: '#00FF00', raw: true }),
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 100,
              categoryId: recipientCategory.id,
            }),
          }),
      });

      // The category lookup is scoped to the account owner → recipient's own categoryId
      // resolves to `not found` → 404.
      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns 404 to a non-recipient creating a transaction on the account (existence masked)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const stranger = await provisionRecipient();

      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns 404 to a recipient with read-only permission attempting to create', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await provisionRecipient();
      await shareAccount({ accountId: account.id, recipient, permission: SHARE_PERMISSIONS.read });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('blocks a recipient from creating a transfer on a shared account (deferred to a later slice)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      // Build a destination account on the recipient's side.
      const destinationAccount = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.createAccount({ raw: true }),
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: {
              ...helpers.buildTransactionPayload({
                accountId: account.id,
                amount: 100,
              }),
              transferNature: 'common_transfer',
              destinationAmount: 100,
              destinationAccountId: destinationAccount.id,
            } as never,
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('PUT /transactions/:id on a shared account', () => {
    it("allows write/all recipient to update an owner's transaction", async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Groceries (owner)');
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          categoryId: ownerCategory.id,
        }),
        raw: true,
      });
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: ownerTx.id,
            payload: { amount: 200 },
          }),
      });

      expect(res.statusCode).toBe(200);
    });

    it("forbids write/own recipient from updating an owner's transaction", async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Groceries (owner)');
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          categoryId: ownerCategory.id,
        }),
        raw: true,
      });
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own,
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: ownerTx.id,
            payload: { amount: 999 },
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.Unauthorized);
    });

    it('allows write/own recipient to update their own transaction on the shared account', async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Groceries (owner)');
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own,
      });

      // Recipient creates their own transaction on the shared account.
      const [recipientTx] = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 50,
              categoryId: ownerCategory.id,
            }),
            raw: true,
          }),
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: recipientTx.id,
            payload: { amount: 60 },
          }),
      });

      expect(res.statusCode).toBe(200);
    });

    it('returns 403 to a non-recipient updating a transaction on a shared account', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });
      const stranger = await provisionRecipient();

      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.updateTransaction({ id: ownerTx.id, payload: { amount: 200 } }),
      });

      // Tx exists but the caller has no write claim — surface "forbidden" rather than
      // the misleading "not found". UUID ids make existence-leak via 403 vs 404 moot.
      expect(res.statusCode).toBe(ERROR_CODES.Forbidden);
    });

    it('returns 403 to a read-only recipient attempting an update', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });
      const recipient = await provisionRecipient();
      await shareAccount({ accountId: account.id, recipient, permission: SHARE_PERMISSIONS.read });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.updateTransaction({ id: ownerTx.id, payload: { amount: 200 } }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.Forbidden);
    });

    it("blocks a write/all recipient from changing the transaction's accountId", async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Groceries (owner)');
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          categoryId: ownerCategory.id,
        }),
        raw: true,
      });
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      const recipientAccount = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.createAccount({ raw: true }),
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: ownerTx.id,
            payload: { accountId: recipientAccount.id },
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('DELETE /transactions/:id on a shared account', () => {
    it("allows write/all recipient to delete an owner's transaction", async () => {
      const account = await helpers.createAccount({ raw: true });
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.deleteTransaction({ id: ownerTx.id }),
      });

      expect(res.statusCode).toBe(200);
    });

    it("forbids write/own recipient from deleting an owner's transaction", async () => {
      const account = await helpers.createAccount({ raw: true });
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own,
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.deleteTransaction({ id: ownerTx.id }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.Unauthorized);
    });

    it('allows write/own recipient to delete their own transaction on the shared account', async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Groceries (owner)');
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own,
      });

      const [recipientTx] = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 50,
              categoryId: ownerCategory.id,
            }),
            raw: true,
          }),
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.deleteTransaction({ id: recipientTx.id }),
      });

      expect(res.statusCode).toBe(200);
    });

    it('returns 403 to a non-recipient deleting a transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });
      const stranger = await provisionRecipient();

      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.deleteTransaction({ id: ownerTx.id }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.Forbidden);
    });

    it('returns 403 to a read-only recipient attempting delete', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });
      const recipient = await provisionRecipient();
      await shareAccount({ accountId: account.id, recipient, permission: SHARE_PERMISSIONS.read });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.deleteTransaction({ id: ownerTx.id }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.Forbidden);
    });

    /**
     * Refund-link guards (Phase-1): recipients cannot create, modify, or remove refund
     * relationships on shared accounts — those flows touch transactions across the
     * caller/owner boundary and need their own slice. Owners always pass through.
     */
    it("rejects recipient deleting an owner's refund-linked transaction with ValidationError", async () => {
      const account = await helpers.createAccount({ raw: true });
      const [originalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      const [refundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 50,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });
      await helpers.createSingleRefund({ originalTxId: originalTx.id, refundTxId: refundTx.id });

      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.deleteTransaction({ id: originalTx.id }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('Phase-1 refund guards on PUT /transactions/:id', () => {
    it('rejects recipient supplying refundsTxId in update payload', async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Groceries (owner)');
      const [originalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: ownerCategory.id,
        }),
        raw: true,
      });
      const [refundCandidate] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 50,
          transactionType: TRANSACTION_TYPES.income,
          categoryId: ownerCategory.id,
        }),
        raw: true,
      });

      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: refundCandidate.id,
            payload: { refundsTxId: originalTx.id },
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects recipient supplying refundedByTxIds in update payload', async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Groceries (owner)');
      const [originalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: ownerCategory.id,
        }),
        raw: true,
      });
      const [refundCandidate] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 50,
          transactionType: TRANSACTION_TYPES.income,
          categoryId: ownerCategory.id,
        }),
        raw: true,
      });

      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: originalTx.id,
            payload: { refundedByTxIds: [refundCandidate.id] },
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('GET /categories?accountId=', () => {
    it("returns the caller's categories when no accountId is provided (back-compat)", async () => {
      const ownCat = await helpers.addCustomCategory({ name: 'mine-1', color: '#000000', raw: true });

      const list = await helpers.getCategoriesList();
      expect(list.find((c) => c.id === ownCat.id)).toBeDefined();
    });

    it("returns the caller's categories when accountId is an owned account", async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownCat = await helpers.addCustomCategory({ name: 'mine-2', color: '#111111', raw: true });

      const list = await helpers.getCategoriesList({ accountId: account.id });
      const found = list.find((c) => c.id === ownCat.id);
      expect(found).toBeDefined();
    });

    it("returns the *owner's* categories when accountId is shared with the caller", async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('owner-only-cat');
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      const list = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCategoriesList({ accountId: account.id }),
      });
      const found = list.find((c) => c.id === ownerCategory.id);
      expect(found).toBeDefined();
    });

    it('returns 404 when accountId references an account the caller has no claim on', async () => {
      const account = await helpers.createAccount({ raw: true });
      const stranger = await provisionRecipient();

      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getCategoriesListResponse({ accountId: account.id }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('CRIT6 — Owner editing recipient-authored tx on shared account', () => {
    it('owner PUTs a tx authored by recipient → 200, tx updated', async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Groceries-crit6');
      const recipient = await provisionRecipient();
      await shareAccount({
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
              amount: 300,
              categoryId: ownerCategory.id,
            }),
            raw: true,
          }),
      });

      // Owner PUTs the recipient's tx
      const res = await helpers.updateTransaction({
        id: recipientTx.id,
        payload: { amount: 9.99 },
      });

      expect(res.statusCode).toBe(200);

      // Confirm amount changed — fetch via GET and compare decimal
      const updated = await helpers.getTransactionById({ id: recipientTx.id, raw: true });
      expect(updated).not.toBeNull();
      expect(updated!.amount).toBe(9.99);
    });

    it('owner DELETEs a tx authored by recipient → 200, tx gone', async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Groceries-crit6-del');
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      const [recipientTx] = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 150,
              categoryId: ownerCategory.id,
            }),
            raw: true,
          }),
      });

      // Owner deletes the recipient's tx
      const res = await helpers.deleteTransaction({ id: recipientTx.id });

      expect(res.statusCode).toBe(200);

      // Confirm it's gone — owner's own GET returns null
      const fetched = await helpers.getTransactionById({ id: recipientTx.id, raw: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((fetched as any).body.response).toBeNull();
    });
  });

  describe('CRIT6 — Splits managed by recipient on owner-authored tx', () => {
    it('recipient with write/all updates owner tx with new splits → 200, splits visible to both', async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Splits-owner-cat');
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1000,
          categoryId: ownerCategory.id,
        }),
        raw: true,
      });

      // Add a second owner category for the split target
      const ownerCategory2 = await ownerCreatesCategory('Splits-owner-cat-2');

      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      // Recipient updates owner's tx adding a split
      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: ownerTx.id,
            payload: {
              splits: [{ categoryId: ownerCategory2.id, amount: 400 }],
            },
          }),
      });

      expect(res.statusCode).toBe(200);

      // Owner can see the split
      const ownerView = await helpers.getTransactions({
        raw: true,
        includeSplits: true,
      });
      const ownerTxView = ownerView!.find((t) => t.id === ownerTx.id);
      expect(ownerTxView).toBeDefined();
      expect(ownerTxView!.splits).toHaveLength(1);
      expect(ownerTxView!.splits![0]!.categoryId).toBe(ownerCategory2.id);

      // Recipient can also see the split
      const recipientView = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getTransactions({ raw: true, includeSplits: true }),
      });
      const recipientTxView = (recipientView as Array<{ id: string; splits?: Array<{ categoryId: string }> }>).find(
        (t) => t.id === ownerTx.id,
      );
      expect(recipientTxView).toBeDefined();
      expect(recipientTxView!.splits).toHaveLength(1);
      expect(recipientTxView!.splits![0]!.categoryId).toBe(ownerCategory2.id);
    });

    it('owner-added splits not lost when recipient edits tx with same split set', async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Preserve-splits-cat');
      const ownerCategory2 = await ownerCreatesCategory('Preserve-splits-cat-2');

      // Owner creates tx with a split already present
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1000,
          categoryId: ownerCategory.id,
          splits: [{ categoryId: ownerCategory2.id, amount: 300 }],
        }),
        raw: true,
      });

      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      // Recipient edits the tx while keeping the same split
      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: ownerTx.id,
            payload: {
              note: 'recipient-edited',
              splits: [{ categoryId: ownerCategory2.id, amount: 300 }],
            },
          }),
      });

      expect(res.statusCode).toBe(200);

      // Split still present after recipient edit
      const view = await helpers.getTransactions({ raw: true, includeSplits: true });
      const txView = view!.find((t) => t.id === ownerTx.id);
      expect(txView).toBeDefined();
      expect(txView!.splits).toHaveLength(1);
      expect(txView!.splits![0]!.categoryId).toBe(ownerCategory2.id);
    });

    it('rejects a recipient supplying their own categoryId in a split row (must be owner-set)', async () => {
      // Regression: the frontend split-dialog used to source split categories from the
      // recipient's own store while the parent tx form already routed to the owner's set.
      // Result: parent uses owner.cat → split sneaks recipient.cat → backend correctly
      // rejects with SPLIT_INVALID_CATEGORY (HTTP 422). Codifies the contract so a future
      // frontend regression that re-introduces the wrong picker is caught here.
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Splits-recipient-leak-owner-cat');
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      // Recipient creates a category on *their own* side — invalid as a split target on
      // the shared account.
      const recipientOwnCategory = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.addCustomCategory({ name: 'split-recipient-side', color: '#0000FF', raw: true }),
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 30,
              transactionType: TRANSACTION_TYPES.expense,
              categoryId: ownerCategory.id,
              splits: [{ categoryId: recipientOwnCategory.id, amount: 10 }],
            }),
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('GET /categories?includeAccessible=true', () => {
    it("returns the union of caller's own categories plus all shared-owner categories", async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('owner-union-cat');
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.read,
      });

      // Recipient creates one of their own — must appear in the union too.
      const recipientOwnCategory = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.addCustomCategory({ name: 'recipient-own-cat', color: '#00FF00', raw: true }),
      });

      const list = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCategoriesList({ includeAccessible: true }),
      });

      expect(list.find((c) => c.id === ownerCategory.id)).toBeDefined();
      expect(list.find((c) => c.id === recipientOwnCategory.id)).toBeDefined();
    });

    it("does not leak categories from owners whose accounts the caller can't read", async () => {
      // Owner has a category on a private (unshared) account; recipient must not see it via
      // the union endpoint.
      const privateCategory = await ownerCreatesCategory('private-owner-cat');
      const recipient = await provisionRecipient();

      const list = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCategoriesList({ includeAccessible: true }),
      });

      expect(list.find((c) => c.id === privateCategory.id)).toBeUndefined();
    });

    it('rejects combining accountId with includeAccessible', async () => {
      const account = await helpers.createAccount({ raw: true });

      const res = await helpers.getCategoriesListResponse({
        accountId: account.id,
        includeAccessible: true,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('Recipient account currency auto-connect', () => {
    it("auto-connects the shared account's currency to the recipient on create", async () => {
      // Owner connects UAH (so the account can be created in UAH) and creates a UAH account.
      await helpers.addUserCurrencies({ currencyCodes: ['UAH'] });
      const account = await helpers.createAccount({
        payload: { ...helpers.buildAccountPayload(), currencyCode: 'UAH' },
        raw: true,
      });
      const ownerCategory = await ownerCreatesCategory('Groceries (owner)');

      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      // Recipient has only their base currency at this point.
      const beforeCurrencies = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getUserCurrencies(),
      });
      expect(beforeCurrencies.find((c) => c.currencyCode === 'UAH')).toBeUndefined();

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 1000,
              transactionType: TRANSACTION_TYPES.expense,
              categoryId: ownerCategory.id,
            }),
          }),
      });

      expect(res.statusCode).toBe(200);

      // UAH was auto-connected under the hood — no user-facing `currencyNotConnected` error.
      const afterCurrencies = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getUserCurrencies(),
      });
      expect(afterCurrencies.find((c) => c.currencyCode === 'UAH')).toBeDefined();
    });

    it("auto-connects the shared account's currency to the recipient on update", async () => {
      await helpers.addUserCurrencies({ currencyCodes: ['UAH'] });
      const account = await helpers.createAccount({
        payload: { ...helpers.buildAccountPayload(), currencyCode: 'UAH' },
        raw: true,
      });
      const ownerCategory = await ownerCreatesCategory('Groceries (owner)');
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1000,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: ownerCategory.id,
        }),
        raw: true,
      });

      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      const beforeCurrencies = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getUserCurrencies(),
      });
      expect(beforeCurrencies.find((c) => c.currencyCode === 'UAH')).toBeUndefined();

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: ownerTx!.id,
            payload: { amount: 2000 },
          }),
      });

      expect(res.statusCode).toBe(200);

      const afterCurrencies = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getUserCurrencies(),
      });
      expect(afterCurrencies.find((c) => c.currencyCode === 'UAH')).toBeDefined();
    });

    it('is a no-op when the shared account currency matches the recipient base currency', async () => {
      // Account in recipient's base currency — no auto-connect needed, and creation succeeds.
      const account = await helpers.createAccount({ raw: true });
      const ownerCategory = await ownerCreatesCategory('Groceries (owner)');
      const recipient = await provisionRecipient();
      await shareAccount({
        accountId: account.id,
        recipient,
        permission: SHARE_PERMISSIONS.write,
        transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all,
      });

      const beforeCurrencies = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getUserCurrencies(),
      });
      const beforeCount = beforeCurrencies.length;

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 100,
              transactionType: TRANSACTION_TYPES.expense,
              categoryId: ownerCategory.id,
            }),
          }),
      });

      expect(res.statusCode).toBe(200);

      const afterCurrencies = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getUserCurrencies(),
      });
      // No additional currency rows added when account currency == recipient base.
      expect(afterCurrencies.length).toBe(beforeCount);
    });
  });
});
