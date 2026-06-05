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
      await helpers.updateUserSettings({
        settings: { locale: 'en', payeeExtractionUsesDescription: true },
      });

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

    it('does not create a Payee for a single-occurrence note', async () => {
      await helpers.updateUserSettings({
        settings: { locale: 'en', payeeExtractionUsesDescription: true },
      });

      const account = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, note: 'OneOffMerchant' }),
        raw: true,
      });

      const payees = await helpers.listPayees({ raw: true });
      expect(payees.find((p) => p.name === 'OneOffMerchant')).toBeUndefined();
    });

    it('still respects caller-supplied payeeId (manual UI assignment wins)', async () => {
      await helpers.updateUserSettings({
        settings: { locale: 'en', payeeExtractionUsesDescription: true },
      });

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
      await helpers.updateUserSettings({
        settings: { locale: 'en', payeeExtractionUsesDescription: true },
      });

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
});
