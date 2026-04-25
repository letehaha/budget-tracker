import { BANK_PROVIDER_TYPE, PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import Transactions from '@models/transactions.model';
import * as helpers from '@tests/helpers';
import { FixedTransaction, MOCK_IDENTIFICATION_HASH_1 } from '@tests/mocks/enablebanking/data';

/**
 * E2E tests for the Enable Banking transaction dedup improvements.
 *
 * Background: Enable Banking re-sends historical transactions on every sync.
 * Hash-based duplicate detection breaks when fields used in the hash mutate
 * across syncs (entry_reference appearing later, transaction_date being added,
 * etc.). These tests pin down the contract for three improvements:
 *
 *  1. Lookup by entry_reference: when a tx initially has no entry_reference
 *     and the bank populates it later, the existing row is matched (not duped)
 *     and its originalId is re-anchored to the canonical hash.
 *
 *  3. Window fuzzy match: when no entry_reference is ever returned and the
 *     selected date shifts between syncs (e.g. transaction_date appears later
 *     and outranks booking_date), a ±2-day fingerprint match prevents dupes.
 *
 *  4. Reconciliation: an explicit endpoint cleans up duplicate pairs that
 *     already exist in the DB from before #1 was deployed.
 */
describe('Enable Banking dedup improvements (E2E)', () => {
  beforeEach(() => {
    helpers.enablebanking.resetSessionCounter();
  });

  afterEach(() => {
    helpers.enablebanking.resetTransactionConfig();
  });

  /**
   * Set up an active connection with one synced account.
   * Caller is expected to have already configured fixed transactions
   * (or accept the default auto-generated set).
   */
  async function setupConnectionWithAccount(): Promise<{ connectionId: number; accountId: number }> {
    const connectResult = await helpers.bankDataProviders.connectProvider({
      providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
      credentials: helpers.enablebanking.mockCredentials(),
      raw: true,
    });
    const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);
    await helpers.makeRequest({
      method: 'post',
      url: '/bank-data-providers/enablebanking/oauth-callback',
      payload: {
        connectionId: connectResult.connectionId,
        code: helpers.enablebanking.mockAuthCode,
        state,
      },
    });
    const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
      connectionId: connectResult.connectionId,
      accountExternalIds: [MOCK_IDENTIFICATION_HASH_1],
      raw: true,
    });
    return {
      connectionId: connectResult.connectionId,
      accountId: syncedAccounts[0]!.id,
    };
  }

  // ==========================================================================
  // #1 — Lookup by entry_reference when it appears in a later sync
  // ==========================================================================
  describe('#1 entry_reference appears in later sync', () => {
    it('does not duplicate a tx when entry_reference is populated on a later sync', async () => {
      const sharedAttributes: FixedTransaction = {
        amount: '42.50',
        currency: 'EUR',
        isExpense: true,
        bookingDate: '2024-03-15',
        valueDate: '2024-03-15',
        counterpartyIban: 'FI1111111111111111',
        remittanceInformation: ['Coffee shop purchase'],
      };

      // Sync 1: tx WITHOUT entry_reference (uses fallback hash)
      helpers.enablebanking.setFixedTransactions([{ ...sharedAttributes }]);
      const { connectionId, accountId } = await setupConnectionWithAccount();

      const txAfterFirstSync = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      expect(txAfterFirstSync.length).toBe(1);
      const initialTx = txAfterFirstSync[0]!;
      expect(initialTx.externalData?.entryReference ?? null).toBeNull();
      const initialOriginalId = initialTx.originalId;

      // Sync 2: same logical tx, now WITH entry_reference (uses canonical hash)
      helpers.enablebanking.setFixedTransactions([{ ...sharedAttributes, entryReference: 'ref_appeared_later_001' }]);
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId, raw: true });

      const txAfterSecondSync = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      expect(txAfterSecondSync.length).toBe(1);
      // Same DB row — not a duplicate
      expect(txAfterSecondSync[0]!.id).toBe(initialTx.id);
      // entryReference is now persisted
      expect(txAfterSecondSync[0]!.externalData?.entryReference).toBe('ref_appeared_later_001');
      // originalId is re-anchored to canonical entry_reference hash
      expect(txAfterSecondSync[0]!.originalId).not.toBe(initialOriginalId);
    });

    it('remains idempotent across many subsequent syncs once entry_reference is anchored', async () => {
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '10.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-04-02',
          counterpartyIban: 'FI3333333333333333',
        },
      ]);
      const { connectionId, accountId } = await setupConnectionWithAccount();

      // Now bank populates entry_reference and we run sync many times
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '10.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-04-02',
          counterpartyIban: 'FI3333333333333333',
          entryReference: 'stable_ref_xyz',
        },
      ]);

      for (let i = 0; i < 4; i++) {
        await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId, raw: true });
        const txs = await helpers.getTransactions({ accountIds: [accountId], raw: true });
        expect(txs.length).toBe(1);
      }
    });

    it('does not collapse two genuinely different txs that share an account but have different entry_references', async () => {
      // Two distinct transactions, both with entry_reference, on the same day
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '5.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-05-10',
          counterpartyIban: 'FI4444444444444444',
          entryReference: 'distinct_a',
        },
        {
          amount: '5.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-05-10',
          counterpartyIban: 'FI4444444444444444',
          entryReference: 'distinct_b',
        },
      ]);
      const { accountId } = await setupConnectionWithAccount();

      const txs = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      expect(txs.length).toBe(2);
    });
  });

  // ==========================================================================
  // #3 — Window fuzzy match (no entry_reference, date shifts)
  // ==========================================================================
  describe('#3 window-based fuzzy match', () => {
    it('does not duplicate when transaction_date appears later and shifts the date used in the hash', async () => {
      // Sync 1: only booking_date, no entry_reference
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '99.99',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-06-20',
          counterpartyIban: 'FI5555555555555555',
          remittanceInformation: ['Service fee'],
        },
      ]);
      const { connectionId, accountId } = await setupConnectionWithAccount();
      const txAfterFirstSync = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      expect(txAfterFirstSync.length).toBe(1);

      // Sync 2: transaction_date now also populated (a different date ~1 day earlier).
      // Under the priority-based date selection, this would change the hash and
      // create a duplicate without the fuzzy fallback.
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '99.99',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-06-20',
          transactionDate: '2024-06-19',
          counterpartyIban: 'FI5555555555555555',
          remittanceInformation: ['Service fee'],
        },
      ]);
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId, raw: true });

      const txAfterSecondSync = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      expect(txAfterSecondSync.length).toBe(1);
    });

    it('still creates a new transaction when the candidate is outside the ±2 day window', async () => {
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '12.34',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-07-01',
          counterpartyIban: 'FI6666666666666666',
        },
      ]);
      const { connectionId, accountId } = await setupConnectionWithAccount();
      expect((await helpers.getTransactions({ accountIds: [accountId], raw: true })).length).toBe(1);

      // A genuinely different transaction with the same amount/counterparty
      // but more than two weeks away — must NOT be matched by the fuzzy fallback.
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '12.34',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-07-01',
          counterpartyIban: 'FI6666666666666666',
        },
        {
          amount: '12.34',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-07-20',
          counterpartyIban: 'FI6666666666666666',
        },
      ]);
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId, raw: true });

      const txs = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      expect(txs.length).toBe(2);
    });

    it('does not match when counterparty IBAN differs (avoids over-collapsing recurring same-amount payments to different parties)', async () => {
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '5.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-08-01',
          counterpartyIban: 'FI7777777777777777',
        },
      ]);
      const { connectionId, accountId } = await setupConnectionWithAccount();

      // Same amount and date but different counterparty — should be a separate tx.
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '5.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-08-01',
          counterpartyIban: 'FI7777777777777777',
        },
        {
          amount: '5.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-08-01',
          counterpartyIban: 'FI8888888888888888',
        },
      ]);
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId, raw: true });

      const txs = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      expect(txs.length).toBe(2);
    });
  });

  // ==========================================================================
  // #4 — One-time reconciliation of pre-existing duplicates
  // ==========================================================================
  describe('#4 reconciliation of existing duplicates', () => {
    /**
     * Helper: insert an orphan that mimics a pre-#1 sync row — a transaction
     * created via POST /transactions then patched directly on the model so its
     * `externalData` carries the counterparty IBAN that a real sync would have
     * stored. The reconcile path's IBAN gate matches on `creditorAccount`
     * (expense) / `debtorAccount` (income), so orphans without one are skipped
     * by design.
     *
     * Defaults `categoryId` to whatever an existing tx on the same account
     * already has — pre-#1 orphans came from the same sync path as the
     * canonical and shared its default category. Tests that want a divergent
     * category override this explicitly.
     */
    async function insertManualOrphan({
      accountId,
      amount,
      time,
      isExpense = true,
      counterpartyIban,
      categoryId,
    }: {
      accountId: number;
      amount: number;
      time: string;
      isExpense?: boolean;
      counterpartyIban?: string;
      categoryId?: number;
    }) {
      let resolvedCategoryId = categoryId;
      if (resolvedCategoryId === undefined) {
        const existing = await helpers.getTransactions({ accountIds: [accountId], raw: true });
        if (existing.length > 0) {
          resolvedCategoryId = existing[0]!.categoryId;
        } else {
          const userCategory = (await helpers.getCategoriesList()) as { id: number }[];
          resolvedCategoryId = userCategory[0]!.id;
        }
      }
      const [tx] = await helpers.createTransaction({
        payload: {
          amount,
          accountId,
          time,
          categoryId: resolvedCategoryId,
          transactionType: isExpense ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
          paymentType: PAYMENT_TYPES.bankTransfer,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        },
        raw: true,
      });
      if (counterpartyIban) {
        const externalData = isExpense ? { creditorAccount: counterpartyIban } : { debtorAccount: counterpartyIban };
        await Transactions.update({ externalData }, { where: { id: tx.id } });
      }
      return tx;
    }

    it('merges a duplicate pair where one has entry_reference and the other does not', async () => {
      // Step 1: bank-synced canonical tx (with entry_reference)
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '50.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-09-10',
          counterpartyIban: 'FI9999999999999999',
          entryReference: 'canonical_ref_001',
        },
      ]);
      const { connectionId, accountId } = await setupConnectionWithAccount();

      const txsAfterSync = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      expect(txsAfterSync.length).toBe(1);
      const canonicalTx = txsAfterSync[0]!;
      expect(canonicalTx.externalData?.entryReference).toBe('canonical_ref_001');

      // Step 2: simulate a pre-#1 orphan — same fingerprint, no entry_reference,
      // but with the same counterparty IBAN that the canonical row stored.
      const orphan = await insertManualOrphan({
        accountId,
        amount: 50.0,
        time: new Date('2024-09-10').toISOString(),
        counterpartyIban: 'FI9999999999999999',
      });
      expect((await helpers.getTransactions({ accountIds: [accountId], raw: true })).length).toBe(2);

      // Step 3: trigger reconciliation
      const reconcileResult = (await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectionId}/reconcile-duplicates`,
        payload: { accountId },
        raw: true,
      })) as { mergedCount: number; skippedCount: number };

      expect(reconcileResult.mergedCount).toBe(1);
      expect(reconcileResult.skippedCount).toBe(0);

      // Step 4: only the canonical row remains
      const finalTxs = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      expect(finalTxs.length).toBe(1);
      expect(finalTxs[0]!.id).toBe(canonicalTx.id);
      expect(finalTxs.find((t: { id: number }) => t.id === orphan.id)).toBeUndefined();
    });

    it('does not merge orphans that have child relations (tags) — preserves user data', async () => {
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '75.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-10-05',
          counterpartyIban: 'FI1010101010101010',
          entryReference: 'canonical_ref_002',
        },
      ]);
      const { connectionId, accountId } = await setupConnectionWithAccount();
      const orphan = await insertManualOrphan({
        accountId,
        amount: 75.0,
        time: new Date('2024-10-05').toISOString(),
        counterpartyIban: 'FI1010101010101010',
      });

      // Attach a tag to the orphan — this makes it unsafe to delete
      const tag = await helpers.createTag({
        payload: { name: `protect-${Date.now()}`, color: '#3b82f6' },
        raw: true,
      });
      await helpers.addTransactionsToTag({
        tagId: tag.id,
        transactionIds: [orphan.id],
      });

      const reconcileResult = (await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectionId}/reconcile-duplicates`,
        payload: { accountId },
        raw: true,
      })) as { mergedCount: number; skippedCount: number };

      expect(reconcileResult.mergedCount).toBe(0);
      expect(reconcileResult.skippedCount).toBe(1);

      const finalTxs = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      expect(finalTxs.length).toBe(2); // orphan was preserved
    });

    it('is idempotent — running reconciliation twice has no extra effect', async () => {
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '11.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-11-01',
          counterpartyIban: 'FI2020202020202020',
          entryReference: 'idem_ref',
        },
      ]);
      const { connectionId, accountId } = await setupConnectionWithAccount();
      await insertManualOrphan({
        accountId,
        amount: 11.0,
        time: new Date('2024-11-01').toISOString(),
        counterpartyIban: 'FI2020202020202020',
      });

      const r1 = (await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectionId}/reconcile-duplicates`,
        payload: { accountId },
        raw: true,
      })) as { mergedCount: number; skippedCount: number };
      expect(r1.mergedCount).toBe(1);

      const r2 = (await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectionId}/reconcile-duplicates`,
        payload: { accountId },
        raw: true,
      })) as { mergedCount: number; skippedCount: number };
      expect(r2.mergedCount).toBe(0);
      expect(r2.skippedCount).toBe(0);

      const finalTxs = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      expect(finalTxs.length).toBe(1);
    });

    it('does not merge an orphan that has no counterparty IBAN — manual entries are not auto-collapsed', async () => {
      // Bank-synced canonical with IBAN
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '20.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-12-01',
          counterpartyIban: 'FI3030303030303030',
          entryReference: 'no_iban_canonical',
        },
      ]);
      const { connectionId, accountId } = await setupConnectionWithAccount();

      // Orphan with no IBAN — could be an unrelated manual cash expense that
      // happens to share amount/currency/type. Must not be merged.
      await insertManualOrphan({
        accountId,
        amount: 20.0,
        time: new Date('2024-12-01').toISOString(),
      });

      const result = (await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectionId}/reconcile-duplicates`,
        payload: { accountId },
        raw: true,
      })) as { mergedCount: number; skippedCount: number };

      expect(result.mergedCount).toBe(0);
      // The IBAN gate short-circuits before the safety check, so the orphan
      // is not even counted as a candidate — it is simply ignored.
      expect(result.skippedCount).toBe(0);
      expect((await helpers.getTransactions({ accountIds: [accountId], raw: true })).length).toBe(2);
    });

    it('does not merge an orphan whose counterparty IBAN differs from the canonical', async () => {
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '30.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-12-05',
          counterpartyIban: 'FI4040404040404040',
          entryReference: 'diff_iban_canonical',
        },
      ]);
      const { connectionId, accountId } = await setupConnectionWithAccount();

      await insertManualOrphan({
        accountId,
        amount: 30.0,
        time: new Date('2024-12-05').toISOString(),
        counterpartyIban: 'FI5050505050505050',
      });

      const result = (await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectionId}/reconcile-duplicates`,
        payload: { accountId },
        raw: true,
      })) as { mergedCount: number; skippedCount: number };

      expect(result.mergedCount).toBe(0);
      expect(result.skippedCount).toBe(0);
      expect((await helpers.getTransactions({ accountIds: [accountId], raw: true })).length).toBe(2);
    });

    it('does not merge an orphan whose user-edited note diverges from the canonical', async () => {
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '60.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-12-10',
          counterpartyIban: 'FI6060606060606060',
          entryReference: 'note_canonical',
        },
      ]);
      const { connectionId, accountId } = await setupConnectionWithAccount();

      const orphan = await insertManualOrphan({
        accountId,
        amount: 60.0,
        time: new Date('2024-12-10').toISOString(),
        counterpartyIban: 'FI6060606060606060',
      });
      // User annotated the orphan — destroying it would silently lose the note.
      await helpers.updateTransaction({
        id: orphan.id,
        payload: { note: 'Coffee with Tom' },
      });

      const result = (await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectionId}/reconcile-duplicates`,
        payload: { accountId },
        raw: true,
      })) as { mergedCount: number; skippedCount: number };

      expect(result.mergedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect((await helpers.getTransactions({ accountIds: [accountId], raw: true })).length).toBe(2);
    });

    it('does not merge an orphan whose user-edited categoryId diverges from the canonical', async () => {
      helpers.enablebanking.setFixedTransactions([
        {
          amount: '70.00',
          currency: 'EUR',
          isExpense: true,
          bookingDate: '2024-12-15',
          counterpartyIban: 'FI7070707070707070',
          entryReference: 'cat_canonical',
        },
      ]);
      const { connectionId, accountId } = await setupConnectionWithAccount();

      const canonicalRows = await helpers.getTransactions({ accountIds: [accountId], raw: true });
      const canonicalCategoryId = canonicalRows[0]!.categoryId;

      // Pick a user-defined category that is different from the canonical's.
      const userCategories = (await helpers.getCategoriesList()) as { id: number }[];
      const otherCategory = userCategories.find((c) => c.id !== canonicalCategoryId);
      expect(otherCategory).toBeDefined();

      const orphan = await insertManualOrphan({
        accountId,
        amount: 70.0,
        time: new Date('2024-12-15').toISOString(),
        counterpartyIban: 'FI7070707070707070',
      });
      await helpers.updateTransaction({
        id: orphan.id,
        payload: { categoryId: otherCategory!.id },
      });

      const result = (await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectionId}/reconcile-duplicates`,
        payload: { accountId },
        raw: true,
      })) as { mergedCount: number; skippedCount: number };

      expect(result.mergedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect((await helpers.getTransactions({ accountIds: [accountId], raw: true })).length).toBe(2);
    });
  });
});
