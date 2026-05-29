import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { ERROR_CODES } from '@js/errors';
import ResourceShares from '@models/resource-shares.model';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

/**
 * Write-path enforcement on household-derived access.
 *
 * Mirrors the per-resource share write tests (`shared-account-writes.service.e2e.ts`)
 * but seeds the grant via a household `ResourceShares` row instead of a per-resource
 * one. Confirms the central write chokepoints — `canUserAccessResource` (resolution),
 * `assertOwnScopeOk` (policy), `Accounts.getAccountById` (owner-only model scope) —
 * treat household-derived recipients identically to per-resource recipients without
 * needing per-call-site code changes.
 *
 * Household membership rows are seeded directly via `ResourceShares.create` to isolate
 * write-path behavior from the invitation accept flow. DB CHECK constraints enforce the
 * row shape so the seeded rows can't drift from production rows.
 */

const seedHouseholdMembership = async ({
  ownerUserId,
  sharedWithUserId,
  permission,
  policy,
}: {
  ownerUserId: number;
  sharedWithUserId: number;
  permission: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
  policy?: { transactionsWriteScope: 'own' | 'all' };
}) =>
  ResourceShares.create({
    ownerUserId,
    sharedWithUserId,
    resourceType: RESOURCE_TYPES.household,
    resourceId: String(ownerUserId),
    permission,
    policy: policy ?? null,
    acceptedAt: new Date(),
  });

describe('Household-derived write access', () => {
  describe('POST /transactions', () => {
    it('allows a household-write recipient to create a transaction on the grantor account', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
        policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all },
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 4321,
              transactionType: TRANSACTION_TYPES.expense,
            }),
          }),
      });

      expect(res.statusCode).toBe(200);
    });

    it('rejects household-read recipient with 404 (existence masked)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.read,
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('PUT /transactions/:id', () => {
    it('allows write/all household recipient to update an owner-created transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });

      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
        policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all },
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: ownerTx!.id,
            payload: { amount: 250 },
          }),
      });

      expect(res.statusCode).toBe(200);
    });

    it('blocks household recipient on policy=own from editing an owner-created transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });

      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
        policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own },
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: ownerTx!.id,
            payload: { amount: 250 },
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.Unauthorized);
    });

    it('allows household recipient on policy=own to edit their own transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
        policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own },
      });

      // Recipient creates their own transaction first.
      const created = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 50 }),
            raw: true,
          }),
      });
      const ownTxId = created[0]!.id;

      // Then edits it under the same policy=own — permitted because creator matches caller.
      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateTransaction({
            id: ownTxId,
            payload: { amount: 75 },
          }),
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('DELETE /transactions/:id', () => {
    it('allows household-write recipient on policy=all to delete an owner-created transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 80 }),
        raw: true,
      });

      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
        policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all },
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.deleteTransaction({ id: ownerTx!.id }),
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('owner-only account ops', () => {
    it('returns 404 when a household-write recipient tries to update the grantor account', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
        policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all },
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.updateAccount({
            id: account.id,
            payload: { name: 'renamed by recipient' },
            raw: false,
          }),
      });

      // Owner-only ops resolve through `Accounts.getAccountById({ id, userId })` which
      // scopes by the caller's userId — household access doesn't lift that scope.
      expect((res as unknown as { statusCode: number }).statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns 404 when a household-write recipient tries to delete the grantor account', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
        policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all },
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.deleteAccount({ id: account.id, raw: false }),
      });

      expect((res as unknown as { statusCode: number }).statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });
});
