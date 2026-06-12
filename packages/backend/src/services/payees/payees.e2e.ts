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

    it('rejects a name that is already an alias of another Payee, with conflictingPayee details', async () => {
      // A canonical name shadows an equal alias in `resolveNormalizedName`
      // (canonical wins), which would silently re-route extractions that used
      // to hit the alias — so the create is refused with a pointer to the
      // alias's owner.
      const owner = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Stripe' }),
        raw: true,
      });
      await helpers.createPayeeAlias({ payeeId: owner.id, rawName: 'Stripe Payments', raw: true });

      const response = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'STRIPE PAYMENTS' }),
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
      const errorBody = response.body.response as unknown as { details?: { conflictingPayee?: unknown } };
      expect(errorBody.details?.conflictingPayee).toEqual({ id: owner.id, name: 'Stripe' });
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

    it("returns 409 when renaming onto another Payee's alias", async () => {
      const owner = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Alias Owner' }),
        raw: true,
      });
      await helpers.createPayeeAlias({ payeeId: owner.id, rawName: 'Shadowed Alias', raw: true });
      const other = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Renamer' }),
        raw: true,
      });

      const response = await helpers.updatePayee({
        id: other.id,
        payload: { name: 'Shadowed Alias' },
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
      const errorBody = response.body.response as unknown as { details?: { conflictingPayee?: unknown } };
      expect(errorBody.details?.conflictingPayee).toEqual({ id: owner.id, name: 'Alias Owner' });
    });

    it('allows renaming a Payee back onto one of its own aliases', async () => {
      // 'Round Trip' becomes an alias after the first rename; renaming back
      // must not be treated as a collision — the hit resolves to the payee
      // being renamed.
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Round Trip' }),
        raw: true,
      });
      await helpers.updatePayee({ id: created.id, payload: { name: 'Detour' }, raw: true });
      const updated = await helpers.updatePayee({ id: created.id, payload: { name: 'Round Trip' }, raw: true });
      expect(updated.name).toBe('Round Trip');
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
      // aliases – without the stale-snapshot fix, the just-inserted alias is
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
      // normalizedName – the precise shape that triggered the bug.
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

  describe('POST /payees/:id/aliases', () => {
    it('adds an alias to the Payee', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'wFirma' }),
        raw: true,
      });

      const updated = await helpers.createPayeeAlias({
        payeeId: payee.id,
        rawName: 'WEB INNOVATIVE SOFTWARE',
        raw: true,
      });

      expect(updated.id).toBe(payee.id);
      expect(updated.aliases?.some((a) => a.normalizedName === 'web innovative software')).toBe(true);
      expect(updated.aliases?.some((a) => a.rawName === 'WEB INNOVATIVE SOFTWARE')).toBe(true);
    });

    it('makes future transactions with the alias text link to the Payee', async () => {
      // The point of a user-curated alias: the extraction pipeline's Step 1
      // exact-match path picks the alias up on the next sync and links the
      // incoming tx to this Payee. Verified through the note-fallback so the
      // HTTP create endpoint can drive the same code path the bank sync uses.
      await helpers.updateUserSettings({
        settings: { locale: 'en', payeeExtractionUsesDescription: true },
      });

      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'wFirma' }),
        raw: true,
      });
      await helpers.createPayeeAlias({
        payeeId: payee.id,
        rawName: 'WEB INNOVATIVE SOFTWARE',
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          note: 'WEB INNOVATIVE SOFTWARE',
        }),
        raw: true,
      });

      expect(tx!.payeeId).toBe(payee.id);
    });

    it('rejects an empty alias name', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'EmptyAliasGuard' }),
        raw: true,
      });

      const response = await helpers.createPayeeAlias({
        payeeId: payee.id,
        rawName: '   ',
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 409 on duplicate alias for the same Payee', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'DupAliasGuard' }),
        raw: true,
      });
      await helpers.createPayeeAlias({
        payeeId: payee.id,
        rawName: 'Variant A',
        raw: true,
      });

      // Same normalized form ("variant a") – the second insert must fail
      // before hitting the UNIQUE index so the caller gets a friendly 409.
      const response = await helpers.createPayeeAlias({
        payeeId: payee.id,
        rawName: 'VARIANT A',
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
    });

    it('returns 404 for an unknown payee id', async () => {
      const response = await helpers.createPayeeAlias({
        payeeId: NONEXISTENT_ID,
        rawName: 'Whatever',
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns 409 with conflictingPayee details when alias matches another Payee canonical name', async () => {
      // "Globex" canonical → adding it as an alias on a different Payee would
      // make the extraction's exact-match step ambiguous. Server must refuse
      // and tell the caller which Payee already owns that string so the UI
      // can offer a "go to Globex" or "merge" affordance.
      const owner = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Globex' }),
        raw: true,
      });
      const other = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Initech' }),
        raw: true,
      });

      const response = await helpers.createPayeeAlias({
        payeeId: other.id,
        rawName: 'Globex',
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
      const errorBody = response.body.response as unknown as { details?: { conflictingPayee?: unknown } };
      expect(errorBody.details?.conflictingPayee).toEqual({ id: owner.id, name: 'Globex' });
    });

    it('returns 409 with conflictingPayee details when alias matches another Payee alias', async () => {
      const owner = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Acme' }),
        raw: true,
      });
      await helpers.createPayeeAlias({
        payeeId: owner.id,
        rawName: 'Acme Holdings',
        raw: true,
      });
      const other = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Hooli' }),
        raw: true,
      });

      const response = await helpers.createPayeeAlias({
        payeeId: other.id,
        rawName: 'ACME HOLDINGS',
        raw: false,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
      const aliasErrorBody = response.body.response as unknown as { details?: { conflictingPayee?: unknown } };
      expect(aliasErrorBody.details?.conflictingPayee).toEqual({ id: owner.id, name: 'Acme' });
    });

    it("returns 404 when adding an alias to another user's payee", async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'AliasCreateCrossUserGuard' }),
        raw: true,
      });

      const handle = await helpers.signUpSecondUser();
      const response = await helpers.asUser({
        cookies: handle.cookies,
        fn: () =>
          helpers.createPayeeAlias({
            payeeId: payee.id,
            rawName: 'Hijack Attempt',
            raw: false,
          }),
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);

      const after = await helpers.getPayeeById({ id: payee.id, raw: true });
      expect(after.aliases?.some((a) => a.normalizedName === 'hijack attempt')).toBe(false);
    });

    it('still detects the own-namespace conflict when another user has the same alias text', async () => {
      // Conflict detection must resolve the alias within THIS user's payee
      // set. If the lookup matches an arbitrary user's alias row, the other
      // user's row shadows the current user's own duplicate and the insert
      // slips through — leaving the same normalizedName on two of the
      // current user's Payees, which makes `findExactMatch` ambiguous.
      const aliasText = 'Coyote Logistics';

      // Another user owns the same alias text first, so a naive
      // `findOne({ normalizedName })` returns their row, not ours.
      const handle = await helpers.signUpSecondUser();
      await helpers.asUser({
        cookies: handle.cookies,
        fn: async () => {
          const foreignPayee = await helpers.createPayee({
            payload: helpers.buildPayeePayload({ name: 'Foreign Coyote Owner' }),
            raw: true,
          });
          await helpers.createPayeeAlias({ payeeId: foreignPayee.id, rawName: aliasText, raw: true });
        },
      });

      const first = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Coyote Holder' }),
        raw: true,
      });
      await helpers.createPayeeAlias({ payeeId: first.id, rawName: aliasText, raw: true });

      const second = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Coyote Pretender' }),
        raw: true,
      });
      const response = await helpers.createPayeeAlias({
        payeeId: second.id,
        rawName: aliasText,
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
      const errorBody = response.body.response as unknown as { details?: { conflictingPayee?: unknown } };
      expect(errorBody.details?.conflictingPayee).toEqual({ id: first.id, name: 'Coyote Holder' });
    });
  });

  describe('DELETE /payees/:id/aliases/:aliasId', () => {
    it('removes an alias from the Payee', async () => {
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'WithAliasOriginal' }),
        raw: true,
      });
      // Force an alias by renaming – the old canonical name lands as an alias.
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
      // canonical without an alias representation – and a follow-up sync
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
      // default `enforce` – the WHERE clause must be scoped to userId.
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
    // merge, or peel aliases off the first user's records – the service must
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
      // user B has their own payee for the target slot – neither slot may
      // reach across users.
      const userBPayee = await helpers.asUser({
        cookies: handle.cookies,
        fn: () =>
          helpers.createPayee({
            payload: helpers.buildPayeePayload({ name: 'UserBPayee' }),
            raw: true,
          }),
      });

      // user B trying to merge their (legitimate) payee into user A's payee –
      // the target id doesn't exist from B's perspective.
      const responseAsB = await helpers.asUser({
        cookies: handle.cookies,
        fn: () => helpers.mergePayees({ sourceId: userBPayee.id, targetId: userAPayee.id, raw: false }),
      });
      expect(responseAsB.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns 404 when deleting an alias on a foreign payee', async () => {
      // Build a payee with an alias by renaming – the previous canonical name
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
