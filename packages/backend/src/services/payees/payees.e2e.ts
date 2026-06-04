import { CATEGORIZATION_MODE, TRANSACTION_TYPES } from '@bt/shared/types';
import { NONEXISTENT_ID } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Payees API', () => {
  describe('POST /payees (createPayee)', () => {
    it('creates a Payee with the supplied name', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Amazon' }),
        raw: true,
      });

      expect(payee.id).toBeDefined();
      expect(payee.name).toBe('Amazon');
      expect(payee.normalizedName).toBe('amazon');
      expect(payee.defaultCategoryId).toBeNull();
    });

    it('accepts a defaultCategoryId owned by the user', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({
          name: 'Netflix',
          defaultCategoryId: global.DEFAULT_CATEGORY_ID,
        }),
        raw: true,
      });
      expect(payee.defaultCategoryId).toBe(global.DEFAULT_CATEGORY_ID);
    });

    it('rejects an empty name', async () => {
      const response = await helpers.createPayee({
        payload: { name: '   ' },
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects a duplicate Payee for the same user', async () => {
      await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Duplicate Co' }),
        raw: true,
      });
      const response = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Duplicate Co' }),
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
    });
  });

  describe('GET /payees (listPayees)', () => {
    it('returns an empty list for a fresh user', async () => {
      const payees = await helpers.listPayees({ raw: true });
      expect(Array.isArray(payees)).toBe(true);
    });

    it('returns Payees created by the user', async () => {
      await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'List One' }),
        raw: true,
      });
      await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'List Two' }),
        raw: true,
      });

      const payees = await helpers.listPayees({ raw: true });
      expect(payees.some((p) => p.name === 'List One')).toBe(true);
      expect(payees.some((p) => p.name === 'List Two')).toBe(true);
    });

    it('filters by `q` substring (normalized)', async () => {
      await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Starbucks Coffee' }),
        raw: true,
      });
      await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Walmart' }),
        raw: true,
      });

      const filtered = await helpers.listPayees({ q: 'star', raw: true });
      expect(filtered.some((p) => p.name === 'Starbucks Coffee')).toBe(true);
      expect(filtered.some((p) => p.name === 'Walmart')).toBe(false);
    });
  });

  describe('GET /payees/:id (getPayee)', () => {
    it('returns the Payee with aliases array', async () => {
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Detail Co' }),
        raw: true,
      });
      const detail = await helpers.getPayeeById({ id: created.id, raw: true });

      expect(detail.id).toBe(created.id);
      expect(detail.aliases).toBeDefined();
      expect(Array.isArray(detail.aliases)).toBe(true);
    });

    it('returns 404 for an unknown id', async () => {
      const response = await helpers.getPayeeById({ id: NONEXISTENT_ID, raw: false });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('PATCH /payees/:id (updatePayee)', () => {
    it('renames and adds the old canonical name as an alias', async () => {
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Old Brand' }),
        raw: true,
      });

      const updated = await helpers.updatePayee({
        id: created.id,
        payload: { name: 'New Brand' },
        raw: true,
      });
      expect(updated.name).toBe('New Brand');

      const detail = await helpers.getPayeeById({ id: created.id, raw: true });
      expect(detail.aliases?.some((a) => a.normalizedName === 'old brand')).toBe(true);
    });

    it('sets defaultCategoryId', async () => {
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Cat Test' }),
        raw: true,
      });
      const updated = await helpers.updatePayee({
        id: created.id,
        payload: { defaultCategoryId: global.DEFAULT_CATEGORY_ID },
        raw: true,
      });
      expect(updated.defaultCategoryId).toBe(global.DEFAULT_CATEGORY_ID);
    });

    it('clears defaultCategoryId when null is passed', async () => {
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({
          name: 'Clearable',
          defaultCategoryId: global.DEFAULT_CATEGORY_ID,
        }),
        raw: true,
      });

      const updated = await helpers.updatePayee({
        id: created.id,
        payload: { defaultCategoryId: null },
        raw: true,
      });
      expect(updated.defaultCategoryId).toBeNull();
    });

    it('returns 409 when renaming to a colliding name', async () => {
      await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Existing One' }),
        raw: true,
      });
      const other = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Other Brand' }),
        raw: true,
      });

      const response = await helpers.updatePayee({
        id: other.id,
        payload: { name: 'Existing One' },
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
    });
  });

  describe('DELETE /payees/:id (deletePayee)', () => {
    it('deletes the Payee', async () => {
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Doomed' }),
        raw: true,
      });

      await helpers.deletePayee({ id: created.id, raw: false });
      const getResponse = await helpers.getPayeeById({ id: created.id, raw: false });
      expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('unlinks transactions but keeps them on delete', async () => {
      const account = await helpers.createAccount({ raw: true });
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Linked Payee' }),
        raw: true,
      });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          payeeId: payee.id,
        }),
        raw: true,
      });
      expect(tx).toBeDefined();

      await helpers.deletePayee({ id: payee.id, raw: false });
      const refetched = await helpers.getTransactionById({ id: tx!.id, raw: true });
      if (!refetched) throw new Error('Refetched transaction missing');
      expect(refetched.payeeId).toBeNull();
    });
  });

  describe('POST /payees/:id/merge', () => {
    it('moves transactions from source to target and deletes source', async () => {
      const account = await helpers.createAccount({ raw: true });
      const source = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Src' }),
        raw: true,
      });
      const target = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Tgt' }),
        raw: true,
      });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          payeeId: source.id,
        }),
        raw: true,
      });
      expect(tx).toBeDefined();

      await helpers.mergePayees({ sourceId: source.id, targetId: target.id, raw: true });

      const refetched = await helpers.getTransactionById({ id: tx!.id, raw: true });
      if (!refetched) throw new Error('Refetched transaction missing');
      expect(refetched.payeeId).toBe(target.id);

      const sourceGone = await helpers.getPayeeById({ id: source.id, raw: false });
      expect(sourceGone.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('rejects merging a Payee into itself', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Self Merge' }),
        raw: true,
      });
      const response = await helpers.mergePayees({
        sourceId: payee.id,
        targetId: payee.id,
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('handles a source whose self-canonical alias matches a freshly-created target alias', async () => {
      // Repro of the (target_id, normalized_name) UNIQUE collision: the merge
      // inserts source.canonicalName as a target alias, then iterates source's
      // aliases — without the stale-snapshot fix, the just-inserted alias is
      // missing from the "already-on-target" set and the alias UPDATE blows up.
      //
      // Building the scenario via the public API:
      //   1. Create T, rename it to seed an alias (any non-conflicting one is fine).
      //   2. Create S with the same name T was renamed to, then rename S back to
      //      its original name twice so it ends up with a self-canonical alias.
      const target = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'TargetMerchant' }),
        raw: true,
      });
      const sourcePending = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'SourceMerchant' }),
        raw: true,
      });
      // Rename SourceMerchant → AltName, then back to SourceMerchant. After
      // the second rename, the row carries an alias matching its OWN canonical
      // normalizedName — the precise shape that triggered the bug.
      await helpers.updatePayee({
        id: sourcePending.id,
        payload: { name: 'AltName' },
        raw: true,
      });
      await helpers.updatePayee({
        id: sourcePending.id,
        payload: { name: 'SourceMerchant' },
        raw: true,
      });
      const sourceWithSelfAlias = await helpers.getPayeeById({ id: sourcePending.id, raw: true });
      expect(sourceWithSelfAlias.aliases?.some((a) => a.normalizedName === 'sourcemerchant')).toBe(true);

      const merged = await helpers.mergePayees({
        sourceId: sourcePending.id,
        targetId: target.id,
        raw: true,
      });
      expect(merged.id).toBe(target.id);

      const targetAfter = await helpers.getPayeeById({ id: target.id, raw: true });
      expect(targetAfter.aliases?.some((a) => a.normalizedName === 'sourcemerchant')).toBe(true);

      const sourceGone = await helpers.getPayeeById({ id: sourcePending.id, raw: false });
      expect(sourceGone.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('DELETE /payees/:id/aliases/:aliasId', () => {
    it('removes an alias from the Payee', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'WithAliasOriginal' }),
        raw: true,
      });
      // Force an alias by renaming — the old canonical name lands as an alias.
      await helpers.updatePayee({
        id: payee.id,
        payload: { name: 'NewCanonical' },
        raw: true,
      });
      const detail = await helpers.getPayeeById({ id: payee.id, raw: true });
      const alias = detail.aliases?.find((a) => a.normalizedName === 'withaliasoriginal');
      expect(alias).toBeDefined();

      await helpers.deletePayeeAlias({
        payeeId: payee.id,
        aliasId: alias!.id,
        raw: false,
      });
      const after = await helpers.getPayeeById({ id: payee.id, raw: true });
      expect(after.aliases?.some((a) => a.id === alias!.id)).toBe(false);
    });

    it('refuses to delete the alias matching the Payee canonical name', async () => {
      // Set up: rename Payee twice so it ends up with an alias matching its
      // current canonical normalizedName. Deleting that one would leave the
      // canonical without an alias representation — and a follow-up sync
      // would just re-create it, so the operation is rejected.
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'CanonGuard' }),
        raw: true,
      });
      await helpers.updatePayee({ id: payee.id, payload: { name: 'TempName' }, raw: true });
      await helpers.updatePayee({ id: payee.id, payload: { name: 'CanonGuard' }, raw: true });
      const detail = await helpers.getPayeeById({ id: payee.id, raw: true });
      const selfAlias = detail.aliases?.find((a) => a.normalizedName === 'canonguard');
      expect(selfAlias).toBeDefined();

      const response = await helpers.deletePayeeAlias({
        payeeId: payee.id,
        aliasId: selfAlias!.id,
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

      const after = await helpers.getPayeeById({ id: payee.id, raw: true });
      expect(after.aliases?.some((a) => a.id === selfAlias!.id)).toBe(true);
    });
  });

  describe('categorizationMode', () => {
    it('defaults a freshly created Payee to `enforce`', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'DefaultMode Co' }),
        raw: true,
      });
      expect(payee.categorizationMode).toBe(CATEGORIZATION_MODE.enforce);
    });

    it('honors a `categorizationMode` supplied on create', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({
          name: 'HintMode Co',
          categorizationMode: CATEGORIZATION_MODE.hint,
        }),
        raw: true,
      });
      expect(payee.categorizationMode).toBe(CATEGORIZATION_MODE.hint);
    });

    it('updates `categorizationMode` via PATCH', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'SwitchMode Co' }),
        raw: true,
      });
      const updated = await helpers.updatePayee({
        id: payee.id,
        payload: { categorizationMode: CATEGORIZATION_MODE.off },
        raw: true,
      });
      expect(updated.categorizationMode).toBe(CATEGORIZATION_MODE.off);
    });

    it('rejects an unknown `categorizationMode` value', async () => {
      const response = await helpers.createPayee({
        payload: { name: 'BadMode Co', categorizationMode: 'whatever' as CATEGORIZATION_MODE },
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('PATCH /payees/bulk-categorization-mode', () => {
    it('updates every Payee owned by the caller', async () => {
      const first = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Bulk One' }),
        raw: true,
      });
      const second = await helpers.createPayee({
        payload: helpers.buildPayeePayload({
          name: 'Bulk Two',
          categorizationMode: CATEGORIZATION_MODE.hint,
        }),
        raw: true,
      });

      const result = await helpers.bulkUpdatePayeeCategorizationMode({
        mode: CATEGORIZATION_MODE.off,
        raw: true,
      });
      expect(result.updatedCount).toBeGreaterThanOrEqual(2);

      const firstAfter = await helpers.getPayeeById({ id: first.id, raw: true });
      const secondAfter = await helpers.getPayeeById({ id: second.id, raw: true });
      expect(firstAfter.categorizationMode).toBe(CATEGORIZATION_MODE.off);
      expect(secondAfter.categorizationMode).toBe(CATEGORIZATION_MODE.off);
    });

    it('returns updatedCount=0 when the user has no Payees', async () => {
      const result = await helpers.bulkUpdatePayeeCategorizationMode({
        mode: CATEGORIZATION_MODE.enforce,
        raw: true,
      });
      expect(result.updatedCount).toBe(0);
    });

    it("leaves another user's Payees alone", async () => {
      const userAPayee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'UserAOwned' }),
        raw: true,
      });

      const handle = await helpers.signUpSecondUser();
      const userBPayee = await helpers.asUser({
        cookies: handle.cookies,
        fn: () =>
          helpers.createPayee({
            payload: helpers.buildPayeePayload({ name: 'UserBOwned' }),
            raw: true,
          }),
      });

      // User B flips their fleet to `off`. User A's payee must stay on the
      // default `enforce` — the WHERE clause must be scoped to userId.
      await helpers.asUser({
        cookies: handle.cookies,
        fn: () =>
          helpers.bulkUpdatePayeeCategorizationMode({
            mode: CATEGORIZATION_MODE.off,
            raw: true,
          }),
      });

      const userAAfter = await helpers.getPayeeById({ id: userAPayee.id, raw: true });
      const userBAfter = await helpers.asUser({
        cookies: handle.cookies,
        fn: () => helpers.getPayeeById({ id: userBPayee.id, raw: true }),
      });
      expect(userAAfter.categorizationMode).toBe(CATEGORIZATION_MODE.enforce);
      expect(userBAfter.categorizationMode).toBe(CATEGORIZATION_MODE.off);
    });

    it('rejects an unknown mode value', async () => {
      const response = await helpers.bulkUpdatePayeeCategorizationMode({
        mode: 'nope' as CATEGORIZATION_MODE,
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('cross-user isolation', () => {
    // Payees are user-scoped. A second user must not be able to read, mutate,
    // merge, or peel aliases off the first user's records — the service must
    // produce 404, not silently leak or destroy data.
    it("returns 404 when fetching another user's payee", async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'OwnedByUserA' }),
        raw: true,
      });

      const handle = await helpers.signUpSecondUser();
      const response = await helpers.asUser({
        cookies: handle.cookies,
        fn: () => helpers.getPayeeById({ id: payee.id, raw: false }),
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it("returns 404 when updating another user's payee", async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'UpdateGuard' }),
        raw: true,
      });

      const handle = await helpers.signUpSecondUser();
      const response = await helpers.asUser({
        cookies: handle.cookies,
        fn: () => helpers.updatePayee({ id: payee.id, payload: { name: 'Hijacked' }, raw: false }),
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it("returns 404 when deleting another user's payee", async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'DeleteGuard' }),
        raw: true,
      });

      const handle = await helpers.signUpSecondUser();
      const response = await helpers.asUser({
        cookies: handle.cookies,
        fn: () => helpers.deletePayee({ id: payee.id, raw: false }),
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns 404 when merging using a foreign source or target', async () => {
      const userAPayee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'UserAPayee' }),
        raw: true,
      });

      const handle = await helpers.signUpSecondUser();
      // user B has their own payee for the target slot — neither slot may
      // reach across users.
      const userBPayee = await helpers.asUser({
        cookies: handle.cookies,
        fn: () =>
          helpers.createPayee({
            payload: helpers.buildPayeePayload({ name: 'UserBPayee' }),
            raw: true,
          }),
      });

      // user B trying to merge their (legitimate) payee into user A's payee —
      // the target id doesn't exist from B's perspective.
      const responseAsB = await helpers.asUser({
        cookies: handle.cookies,
        fn: () => helpers.mergePayees({ sourceId: userBPayee.id, targetId: userAPayee.id, raw: false }),
      });
      expect(responseAsB.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns 404 when deleting an alias on a foreign payee', async () => {
      // Build a payee with an alias by renaming — the previous canonical name
      // sticks around as an alias.
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'AliasGuardOriginal' }),
        raw: true,
      });
      await helpers.updatePayee({
        id: payee.id,
        payload: { name: 'AliasGuardRenamed' },
        raw: true,
      });
      const detail = await helpers.getPayeeById({ id: payee.id, raw: true });
      const alias = detail.aliases?.find((a) => a.normalizedName === 'aliasguardoriginal');
      expect(alias).toBeDefined();

      const handle = await helpers.signUpSecondUser();
      const response = await helpers.asUser({
        cookies: handle.cookies,
        fn: () =>
          helpers.deletePayeeAlias({
            payeeId: payee.id,
            aliasId: alias!.id,
            raw: false,
          }),
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);

      // The alias is still on the original owner's payee.
      const after = await helpers.getPayeeById({ id: payee.id, raw: true });
      expect(after.aliases?.some((a) => a.id === alias!.id)).toBe(true);
    });
  });
});
