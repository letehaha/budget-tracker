import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

/**
 * E2E coverage for the `payeeExtractionUsesDescription` user setting.
 *
 * The flag governs whether Payee auto-extraction should fall back to the
 * transaction `note` (description) when the provider's dedicated merchant
 * field is empty. Manual UI creates also flow through this path — they
 * never supply `rawMerchantName`, so the flag is what decides whether
 * `note` becomes the extraction signal.
 *
 * Step 3 of extraction (occurrence-based promotion) is the path exercised
 * here: with zero existing Payees, the 1st tx finds no priors and bails,
 * the 2nd tx finds 1 prior with matching normalized name → spins up a new
 * Payee and backfills both.
 */
const enableNoteExtraction = () =>
  helpers.updateUserSettings({
    settings: { locale: 'en', payeeExtractionUsesDescription: true },
  });

describe('Payee extraction — description/note fallback flag', () => {
  describe('default (flag OFF)', () => {
    it('does NOT create a Payee from `note` when the flag is unset', async () => {
      const account = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, note: 'Glovo' }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, note: 'Glovo' }),
        raw: true,
      });

      const payees = await helpers.listPayees({ raw: true });
      expect(payees.find((p) => p.name === 'Glovo')).toBeUndefined();
    });
  });

  describe('when payeeExtractionUsesDescription is ON', () => {
    it('promotes a new Payee after the 2nd transaction with the same note', async () => {
      await enableNoteExtraction();

      const account = await helpers.createAccount({ raw: true });

      // First tx: Step 3 finds zero priors → no Payee yet.
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, note: 'Spotify' }),
        raw: true,
      });
      let payees = await helpers.listPayees({ raw: true });
      expect(payees.find((p) => p.name === 'Spotify')).toBeUndefined();

      // Second tx: 1 prior + current → Payee created + both backfilled.
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, note: 'Spotify' }),
        raw: true,
      });
      payees = await helpers.listPayees({ raw: true });
      const spotify = payees.find((p) => p.name === 'Spotify');
      expect(spotify).toBeDefined();
      expect(spotify?.normalizedName).toBe('spotify');
    });

    it('still respects caller-supplied payeeId (manual UI assignment wins)', async () => {
      await enableNoteExtraction();

      const manualPayee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Manual Pick' }),
        raw: true,
      });

      const account = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          note: 'Glovo',
          payeeId: manualPayee.id,
        }),
        raw: true,
      });

      const payees = await helpers.listPayees({ raw: true });
      expect(payees.find((p) => p.name === 'Glovo')).toBeUndefined();
      expect(payees.find((p) => p.name === 'Manual Pick')).toBeDefined();
    });
  });

  describe('payee_rule runs inline during tx create — AI runs later on uncategorized rows only', () => {
    // The ordering invariant: `createTransaction` resolves a Payee and applies
    // `payee_rule` categorization synchronously, so the row is already stamped
    // with `categorizationMeta.source = 'payee_rule'` by the time AI's
    // debounced listener fires. AI then filters on `categorizationMeta IS
    // NULL` and skips the row. Tested here via the note-extraction path since
    // the HTTP create endpoint doesn't accept `rawMerchantName` directly —
    // bank sync calls the service layer with both fields and exercises the
    // exact same code path.
    it('applies payee_rule via Step 1 exact match before any async pass runs', async () => {
      await enableNoteExtraction();

      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({
          name: 'Spotify',
          defaultCategoryId: global.DEFAULT_CATEGORY_ID,
        }),
        raw: true,
      });

      const otherCategory = await helpers.addCustomCategory({
        raw: true,
        name: `Other Cat ${Date.now()}`,
        color: '#ffffff',
      });

      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          note: 'Spotify',
          categoryId: otherCategory.id,
        }),
        raw: true,
      });

      // Extraction linked the row to the existing Payee + payee_rule
      // overwrote the caller's `otherCategory` with the Payee's default. If
      // the order ever flipped (AI first), the row would arrive at AI with
      // `categorizationMeta = null` and likely get a different category.
      expect(tx.payeeId).toBe(payee.id);
      expect(tx.categoryId).toBe(global.DEFAULT_CATEGORY_ID);
    });
  });

  describe('occurrence-based promotion and planned rows', () => {
    it('backfills the promoted Payee onto real rows only, never onto a plan', async () => {
      // A plan records an intention, so it is neither evidence of a recurring
      // merchant nor a row the promotion may stamp. Real rows carrying the
      // same note still promote and still get backfilled.
      await enableNoteExtraction();

      const account = await helpers.createAccount({ raw: true });

      const [planned] = await helpers.createPlannedTransaction({
        payload: {
          accountId: account.id,
          note: 'Quantum Diner',
          time: '2030-04-01T12:00:00.000Z',
        },
        raw: true,
      });
      const [firstReal] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, note: 'Quantum Diner' }),
        raw: true,
      });
      const [secondReal] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, note: 'Quantum Diner' }),
        raw: true,
      });

      const payees = await helpers.listPayees({ raw: true });
      const promoted = payees.find((p) => p.name === 'Quantum Diner');
      expect(promoted).toBeDefined();
      expect(payees.filter((p) => p.name === 'Quantum Diner')).toHaveLength(1);

      const [plannedAfter, firstRealAfter, secondRealAfter] = await Promise.all([
        helpers.getTransactionById({ id: planned!.id, raw: true }),
        helpers.getTransactionById({ id: firstReal!.id, raw: true }),
        helpers.getTransactionById({ id: secondReal!.id, raw: true }),
      ]);

      expect(plannedAfter!.isPlanned).toBe(true);
      expect(plannedAfter!.payeeId).toBeNull();
      expect(firstRealAfter!.payeeId).toBe(promoted!.id);
      expect(secondRealAfter!.payeeId).toBe(promoted!.id);
    });
  });

  /**
   * The transaction create endpoint accepts no `rawMerchantName`, so these tests
   * drive promotion through the `payeeExtractionUsesDescription` note fallback.
   * Concurrent promotions race the `payees_user_id_normalized_name_uniq` index.
   */
  describe('concurrency safety', () => {
    it('creates only one Payee when two transactions promote the same merchant concurrently', async () => {
      await enableNoteExtraction();
      const merchant = `RaceMerchant-${generateRandomRecordId()}`;
      const account = await helpers.createAccount({ raw: true });

      // Promotion needs a prior unmatched occurrence, so both concurrent creates
      // below qualify only after this seed.
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, note: merchant }),
        raw: true,
      });

      const [firstResponse, secondResponse] = await Promise.all([
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({ accountId: account.id, note: merchant }),
          raw: false,
        }),
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({ accountId: account.id, note: merchant }),
          raw: false,
        }),
      ]);

      // The losing racer adopts the winner's Payee, so neither create returns 5xx.
      expect(firstResponse.statusCode).toBeLessThan(500);
      expect(secondResponse.statusCode).toBeLessThan(500);

      const payees = await helpers.listPayees({ raw: true });
      expect(payees.filter((p) => p.name === merchant)).toHaveLength(1);
    });

    it('creates only one Payee when two accounts of one user promote the same merchant concurrently', async () => {
      await enableNoteExtraction();
      const merchant = `MultiAccountMerchant-${generateRandomRecordId()}`;
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      // Occurrence counting is user-scoped, so one seed qualifies promotion on
      // both accounts.
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: accountA.id, note: merchant }),
        raw: true,
      });

      const [firstResponse, secondResponse] = await Promise.all([
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({ accountId: accountA.id, note: merchant }),
          raw: false,
        }),
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({ accountId: accountB.id, note: merchant }),
          raw: false,
        }),
      ]);

      expect(firstResponse.statusCode).toBeLessThan(500);
      expect(secondResponse.statusCode).toBeLessThan(500);

      const payees = await helpers.listPayees({ raw: true });
      expect(payees.filter((p) => p.name === merchant)).toHaveLength(1);
    });
  });
});
