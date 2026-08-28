import { ACCESS_SOURCES, RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Accounts from '@models/accounts.model';
import ResourceShares from '@models/resource-shares.model';
import * as helpers from '@tests/helpers';
import { CustomResponse } from '@tests/helpers/common';

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

type AccountListResponse = Array<{
  id: string;
  externalId: string | null;
  bankDataProviderConnectionId: number | null;
  share?: { isOwner: boolean; permission: string; accessSource: string };
}>;

const seedHouseholdMembership = async ({
  ownerUserId,
  sharedWithUserId,
  permission,
  acceptedAt = new Date(),
}: {
  ownerUserId: number;
  sharedWithUserId: number;
  permission: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
  acceptedAt?: Date | null;
}) =>
  ResourceShares.create({
    ownerUserId,
    sharedWithUserId,
    resourceType: RESOURCE_TYPES.household,
    resourceId: String(ownerUserId),
    permission,
    acceptedAt,
  });

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

    it('surfaces an accepted-shared account with isOwner=false on both the list and the detail endpoint', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const invitation = await shareAccountReadOnly({ accountId: account.id, recipientEmail: recipient.email });

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
    }, 30000);
  });

  describe('no access at all', () => {
    it('hides the account and its transactions from a stranger across list, detail and filtered reads', async () => {
      const account = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 50 }),
        raw: true,
      });

      const stranger = await helpers.provisionSecondUserWithBaseCurrency();

      const accounts = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getAccounts(),
      });
      expect(accounts.find((a) => a.id === account.id)).toBeUndefined();

      const detailRes = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getAccount({ id: account.id, raw: false }),
      });
      expect(detailRes.statusCode).toBe(200);
      // The existing endpoint returns null when the user has no access (controller-level
      // semantics — we keep it consistent for the shared case).
      expect((detailRes as unknown as CustomResponse<null>).body.response).toBeNull();

      const txns = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getTransactions({ raw: true }),
      });
      expect((txns as Array<{ accountId: string }>).filter((tx) => tx.accountId === account.id)).toHaveLength(0);

      const filteredRes = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () =>
          helpers.getTransactions({
            raw: false,
            accountIds: [account.id],
          }),
      });
      expect(filteredRes.statusCode).toBe(200);
      expect((filteredRes as unknown as CustomResponse<unknown[]>).body.response).toEqual([]);
    }, 30000);
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

    it('redacts externalId and bankDataProviderConnectionId on both GET /accounts and GET /accounts/:id for the recipient', async () => {
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
    }, 30000);

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
  });

  /**
   * Recipient list endpoints must surface household-derived accounts with the right
   * `accessSource` discriminator; when a per-resource share and a household membership
   * cover the same account, the share wins (`accessSource='share'`).
   * Membership rows are seeded via `ResourceShares.create` to isolate visibility from
   * the invitation accept path; DB CHECK constraints keep seeded rows production-shaped.
   */
  describe('household-derived', () => {
    it('surfaces every grantor account with accessSource=household, redacted bank metadata and a shared-with-me row', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      await Accounts.update(
        {
          externalId: 'stable-hash-456',
          externalData: { iban: 'BE12345', ownerName: 'Owner', rawAccountData: { x: 1 } },
        },
        { where: { id: accountA.id } },
      );
      const accountB = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'second' }),
        raw: true,
      });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      await seedHouseholdMembership({
        ownerUserId: accountA.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
      });

      const accounts = (await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccounts(),
      })) as unknown as AccountListResponse;

      const visibleIds = new Set(accounts.map((a) => a.id));
      expect(visibleIds.has(accountA.id)).toBe(true);
      expect(visibleIds.has(accountB.id)).toBe(true);

      const fromList = accounts.find((a) => a.id === accountA.id)!;
      expect(fromList.share).toBeDefined();
      expect(fromList.share!.isOwner).toBe(false);
      expect(fromList.share!.permission).toBe(SHARE_PERMISSIONS.write);
      expect(fromList.share!.accessSource).toBe(ACCESS_SOURCES.household);
      expect(fromList.externalId).toBeNull();
      expect(fromList.bankDataProviderConnectionId).toBeNull();

      const items = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.listSharedWithMe({ raw: true }),
      });
      const householdRow = items.find(
        (i) => i.resourceType === RESOURCE_TYPES.household && i.resourceId === String(accountA.userId),
      );
      expect(householdRow).toBeDefined();
      expect(householdRow!.accessSource).toBe(ACCESS_SOURCES.household);
      expect(householdRow!.permission).toBe(SHARE_PERMISSIONS.write);
      expect(householdRow!.owner.username).toBeTruthy();
    }, 30000);

    it('per-resource share wins over household — accessSource=share and permission from per-resource', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      // Household membership at write must not shadow the per-resource share.
      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
      });

      const accounts = (await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccounts(),
      })) as unknown as AccountListResponse;

      const matches = accounts.filter((a) => a.id === account.id);
      // No duplicate row even though both share sources match.
      expect(matches).toHaveLength(1);
      expect(matches[0]!.share!.permission).toBe(SHARE_PERMISSIONS.read);
      expect(matches[0]!.share!.accessSource).toBe(ACCESS_SOURCES.share);

      const items = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.listSharedWithMe({ raw: true }),
      });
      const accountRow = items.find(
        (i) => i.resourceType === RESOURCE_TYPES.account && i.resourceId === String(account.id),
      );
      expect(accountRow).toBeDefined();
      expect(accountRow!.accessSource).toBe(ACCESS_SOURCES.share);
    }, 30000);

    it('does not surface grantor accounts when the household share is pending (acceptedAt=null)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
        acceptedAt: null,
      });

      const accounts = (await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccounts(),
      })) as unknown as AccountListResponse;

      expect(accounts.find((a) => a.id === account.id)).toBeUndefined();
    });
  });
});
