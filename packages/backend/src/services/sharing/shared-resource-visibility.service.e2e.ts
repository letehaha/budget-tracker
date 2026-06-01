import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTION_TYPES } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import * as helpers from '@tests/helpers';
import type { CustomResponse } from '@tests/helpers/common';
import { describe, expect, it } from 'vitest';

/** Owner shares an account with a recipient and the recipient accepts. */
async function shareAccountReadOnly({ accountId, recipientEmail }: { accountId: string; recipientEmail: string }) {
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
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
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
      const stranger = await helpers.provisionSecondUserWithBaseCurrency();

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
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
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
      const body = (res as unknown as CustomResponse<{ id: string; share?: { isOwner: boolean; permission: string } }>)
        .body.response;
      expect(body.id).toBe(account.id);
      expect(body.share).toBeDefined();
      expect(body.share!.isOwner).toBe(false);
      expect(body.share!.permission).toBe(SHARE_PERMISSIONS.read);
    });

    it('returns null for a non-recipient', async () => {
      const account = await helpers.createAccount({ raw: true });
      const stranger = await helpers.provisionSecondUserWithBaseCurrency();

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

  // Owner-side bank-link metadata (externalId / connection FK) carries
  // PII (IBAN, owner name, address) and provider-internal identifiers like
  // identification_hash. Recipients have no use for it and shouldn't see it.
  // externalData is no longer exposed via the API at all — verified directly
  // against the DB row for the owner-side test.
  describe('owner-side bank-link metadata is redacted for recipients', () => {
    type SharedAccountResponse = {
      id: string;
      externalId: string | null;
      bankDataProviderConnectionId: number | null;
      share?: { isOwner: boolean };
    };

    const SENSITIVE_EXTERNAL_DATA = {
      iban: 'BE67967310247287',
      ownerName: 'Owner Name',
      rawAccountData: { identification_hash: 'stable-hash-123' },
    };
    const SENSITIVE_EXTERNAL_ID = 'stable-hash-123';

    async function createAccountWithBankMetadata() {
      const account = await helpers.createAccount({ raw: true });
      await Accounts.update(
        { externalId: SENSITIVE_EXTERNAL_ID, externalData: SENSITIVE_EXTERNAL_DATA },
        { where: { id: account.id } },
      );
      return account;
    }

    it('redacts externalId and bankDataProviderConnectionId on GET /accounts for the recipient', async () => {
      const account = await createAccountWithBankMetadata();
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const invitation = await shareAccountReadOnly({ accountId: account.id, recipientEmail: recipient.email });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      const accounts = (await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccounts(),
      })) as unknown as SharedAccountResponse[];

      const found = accounts.find((a) => a.id === account.id);
      expect(found).toBeDefined();
      expect(found!.share).toBeDefined();
      expect(found!.share!.isOwner).toBe(false);
      expect(found!.externalId).toBeNull();
      expect(found!.bankDataProviderConnectionId).toBeNull();
    });

    it('redacts externalId and bankDataProviderConnectionId on GET /accounts/:id for the recipient', async () => {
      const account = await createAccountWithBankMetadata();
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
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
      const body = (res as unknown as CustomResponse<SharedAccountResponse>).body.response;
      expect(body.share).toBeDefined();
      expect(body.share!.isOwner).toBe(false);
      expect(body.externalId).toBeNull();
      expect(body.bankDataProviderConnectionId).toBeNull();
    });

    it('still exposes bank-link metadata to the owner on the same account', async () => {
      const account = await createAccountWithBankMetadata();

      const accounts = (await helpers.getAccounts()) as unknown as SharedAccountResponse[];
      const found = accounts.find((a) => a.id === account.id);
      expect(found).toBeDefined();
      expect(found!.share).toBeDefined();
      expect(found!.share!.isOwner).toBe(true);
      expect(found!.externalId).toBe(SENSITIVE_EXTERNAL_ID);

      // externalData isn't exposed via the API — read it directly from the DB.
      const ownerRow = await Accounts.findByPk(account.id);
      expect(ownerRow!.externalData).toEqual(SENSITIVE_EXTERNAL_DATA);
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

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const invitation = await shareAccountReadOnly({ accountId: account.id, recipientEmail: recipient.email });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      const recipientTxns = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getTransactions({ raw: true }),
      });
      const onAccount = (recipientTxns as Array<{ accountId: string }>).filter((tx) => tx.accountId === account.id);
      expect(onAccount).toHaveLength(2);
    });

    it("does not surface the owner's transactions to a stranger", async () => {
      const account = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 50 }),
        raw: true,
      });

      const stranger = await helpers.provisionSecondUserWithBaseCurrency();
      const txns = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getTransactions({ raw: true }),
      });
      expect((txns as Array<{ accountId: string }>).filter((tx) => tx.accountId === account.id)).toHaveLength(0);
    });

    it('drops accountIds outside the accessible set silently (returns empty)', async () => {
      const account = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 25 }),
        raw: true,
      });

      const stranger = await helpers.provisionSecondUserWithBaseCurrency();
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
