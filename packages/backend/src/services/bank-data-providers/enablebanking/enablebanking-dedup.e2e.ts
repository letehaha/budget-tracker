import { BANK_PROVIDER_TYPE, PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
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
     * Helper: insert a "manual orphan" — a transaction created via the
     * regular POST /transactions endpoint on a bank account. It has no
     * externalData.entryReference, mimicking what a pre-#1 sync would have
     * left behind.
     */
    async function insertManualOrphan({
      accountId,
      amount,
      time,
      isExpense = true,
    }: {
      accountId: number;
      amount: number;
      time: string;
      isExpense?: boolean;
    }) {
      const userCategory = (await helpers.getCategoriesList()) as { id: number }[];
      const categoryId = userCategory[0]!.id;
      const [tx] = await helpers.createTransaction({
        payload: {
          amount,
          accountId,
          time,
          categoryId,
          transactionType: isExpense ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
          paymentType: PAYMENT_TYPES.bankTransfer,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        },
        raw: true,
      });
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

      // Step 2: simulate a pre-#1 orphan — same fingerprint, no entry_reference
      const orphan = await insertManualOrphan({
        accountId,
        amount: 50.0,
        time: new Date('2024-09-10').toISOString(),
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
  });
});
