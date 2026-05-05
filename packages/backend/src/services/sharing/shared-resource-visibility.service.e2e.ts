import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { CustomResponse } from '@tests/helpers/common';

async function provisionSecondUserWithBaseCurrency() {
  const handle = await helpers.signUpSecondUser();
  await helpers.asUser({
    cookies: handle.cookies,
    fn: async () => {
      const res = await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY.code });
      if (res.statusCode !== 200) {
        throw new Error(`Failed to set base currency for second user: ${res.statusCode} ${JSON.stringify(res.body)}`);
      }
    },
  });
  return handle;
}

/** Owner shares an account with a recipient and the recipient accepts. */
async function shareAccountReadOnly({ accountId, recipientEmail }: { accountId: number; recipientEmail: string }) {
  const invitation = await helpers.createShareInvitation({
    inviteeEmail: recipientEmail,
    resourceType: RESOURCE_TYPES.account,
    resourceId: accountId,
    permission: SHARE_PERMISSIONS.read,
    raw: true,
  });
  return invitation;
}

describe('Shared resource visibility (S3)', () => {
  describe('GET /accounts', () => {
    it('returns the owner own accounts with a share block flagging isOwner=true', async () => {
      const account = await helpers.createAccount({ raw: true });

      const accounts = await helpers.getAccounts();
      const found = accounts.find((a) => a.id === account.id);
      expect(found).toBeDefined();
      // The serializer emits `share` for user-facing list responses.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const share = (found as any).share as { isOwner: boolean; permission: string; owner: { id: number } } | undefined;
      expect(share).toBeDefined();
      expect(share!.isOwner).toBe(true);
      expect(share!.permission).toBe(SHARE_PERMISSIONS.manage);
    });

    it("includes accepted-shared accounts in the recipient's account list", async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await provisionSecondUserWithBaseCurrency();
      const invitation = await shareAccountReadOnly({ accountId: account.id, recipientEmail: recipient.email });

      // Recipient accepts the invitation
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      const accounts = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccounts(),
      });
      const found = accounts.find((a) => a.id === account.id);
      expect(found).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const share = (found as any).share as
        | { isOwner: boolean; permission: string; owner: { username: string } }
        | undefined;
      expect(share).toBeDefined();
      expect(share!.isOwner).toBe(false);
      expect(share!.permission).toBe(SHARE_PERMISSIONS.read);
      expect(share!.owner.username).toBeTruthy();
    });

    it("does not include the account in a non-recipient's list", async () => {
      const account = await helpers.createAccount({ raw: true });
      const stranger = await provisionSecondUserWithBaseCurrency();

      const accounts = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getAccounts(),
      });
      expect(accounts.find((a) => a.id === account.id)).toBeUndefined();
    });
  });

  describe('GET /accounts/:id', () => {
    it('returns the shared account for the recipient with isOwner=false', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await provisionSecondUserWithBaseCurrency();
      const invitation = await shareAccountReadOnly({ accountId: account.id, recipientEmail: recipient.email });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccount({ id: account.id, raw: false }),
      });
      expect(res.statusCode).toBe(200);
      const body = (res as unknown as CustomResponse<{ id: number; share?: { isOwner: boolean; permission: string } }>)
        .body.response;
      expect(body.id).toBe(account.id);
      expect(body.share).toBeDefined();
      expect(body.share!.isOwner).toBe(false);
      expect(body.share!.permission).toBe(SHARE_PERMISSIONS.read);
    });

    it('returns null for a non-recipient', async () => {
      const account = await helpers.createAccount({ raw: true });
      const stranger = await provisionSecondUserWithBaseCurrency();

      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getAccount({ id: account.id, raw: false }),
      });
      expect(res.statusCode).toBe(200);
      // The existing endpoint returns null when the user has no access (controller-level
      // semantics — we keep it consistent for the shared case).
      expect((res as unknown as CustomResponse<null>).body.response).toBeNull();
    });
  });

  describe('GET /transactions', () => {
    it("returns the owner's transactions on a shared account to the recipient", async () => {
      const account = await helpers.createAccount({ raw: true });

      // Owner adds a couple of transactions before sharing.
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      const recipient = await provisionSecondUserWithBaseCurrency();
      const invitation = await shareAccountReadOnly({ accountId: account.id, recipientEmail: recipient.email });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      const recipientTxns = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getTransactions({ raw: true }),
      });
      const onAccount = (recipientTxns as Array<{ accountId: number }>).filter((tx) => tx.accountId === account.id);
      expect(onAccount).toHaveLength(2);
    });

    it("does not surface the owner's transactions to a stranger", async () => {
      const account = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 50 }),
        raw: true,
      });

      const stranger = await provisionSecondUserWithBaseCurrency();
      const txns = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getTransactions({ raw: true }),
      });
      expect((txns as Array<{ accountId: number }>).filter((tx) => tx.accountId === account.id)).toHaveLength(0);
    });

    it('drops accountIds outside the accessible set silently (returns empty)', async () => {
      const account = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 25 }),
        raw: true,
      });

      const stranger = await provisionSecondUserWithBaseCurrency();
      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () =>
          helpers.getTransactions({
            raw: false,
            accountIds: [account.id],
          }),
      });
      expect(res.statusCode).toBe(200);
      expect((res as unknown as CustomResponse<unknown[]>).body.response).toEqual([]);
    });
  });
});
