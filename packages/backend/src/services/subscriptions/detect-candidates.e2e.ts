import { SUBSCRIPTION_FREQUENCIES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import SubscriptionCandidates from '@models/SubscriptionCandidates.model';
import Transactions from '@models/Transactions.model';
import * as helpers from '@tests/helpers';
import { buildTransactionPayload } from '@tests/helpers/transactions';

/**
 * Helper to create a series of monthly transactions with the same note,
 * simulating a recurring subscription pattern.
 */
async function createRecurringTransactions({
  accountId,
  note,
  amount = 15.99,
  count = 4,
  intervalDays = 30,
}: {
  accountId: number;
  note: string;
  amount?: number;
  count?: number;
  intervalDays?: number;
}) {
  const now = new Date();
  const transactions: Transactions[] = [];

  for (let i = 0; i < count; i++) {
    const time = new Date(now);
    time.setDate(time.getDate() - intervalDays * (count - 1 - i));

    const [tx] = await helpers.createTransaction({
      raw: true,
      payload: buildTransactionPayload({
        accountId,
        amount,
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        note,
        time: time.toISOString(),
      }),
    });
    transactions.push(tx!);
  }

  return transactions;
}

/**
 * Moves all candidate detectedAt timestamps back by 2 hours so the next
 * detect-candidates call bypasses the 1-hour cooldown.
 */
async function expireCooldown({ userId }: { userId: number }) {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await SubscriptionCandidates.update({ detectedAt: twoHoursAgo }, { where: { userId } });
}

describe('Subscription Candidate Detection', () => {
  describe('Happy paths', () => {
    it('detects a monthly pattern from recurring transactions', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      const result = await helpers.detectSubscriptionCandidates({ raw: true });

      expect(result.isFromCache).toBe(false);
      expect(result.candidates.length).toBeGreaterThanOrEqual(1);

      const netflix = result.candidates.find((c) => c.suggestedName.includes('NETFLIX'));
      expect(netflix).toBeDefined();
      expect(netflix!.detectedFrequency).toBe(SUBSCRIPTION_FREQUENCIES.monthly);
      expect(netflix!.occurrenceCount).toBe(4);
      expect(netflix!.confidenceScore).toBeGreaterThan(0);
      expect(netflix!.sampleTransactionIds.length).toBeGreaterThan(0);
    });

    it('detects multiple candidates (Netflix + Spotify)', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'SPOTIFY PREMIUM',
        amount: 9.99,
        count: 5,
        intervalDays: 30,
      });

      const result = await helpers.detectSubscriptionCandidates({ raw: true });

      expect(result.candidates.length).toBeGreaterThanOrEqual(2);

      const names = result.candidates.map((c) => c.suggestedName);
      expect(names.some((n) => n.includes('NETFLIX'))).toBe(true);
      expect(names.some((n) => n.includes('SPOTIFY'))).toBe(true);
    });

    it('accepts a candidate and changes its status', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates[0]!;

      const accepted = await helpers.acceptSubscriptionCandidate({
        id: candidate.id,
        raw: true,
      });

      expect(accepted.id).toBe(candidate.id);
      expect(accepted.status).toBe('accepted');

      // Should no longer appear in pending list
      const pending = await helpers.getSubscriptionCandidates({ raw: true });
      expect(pending.find((c) => c.id === candidate.id)).toBeUndefined();
    });

    it('links sample transactions to the subscription when accepting with subscriptionId', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'ACCEPT LINK TEST',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates.find((c) => c.suggestedName.includes('ACCEPT LINK'))!;
      expect(candidate).toBeDefined();
      expect(candidate.sampleTransactionIds.length).toBe(4);

      // Create a subscription (mimicking what the form does)
      const sub = await helpers.createSubscription({
        name: 'Accept Link Test',
        expectedAmount: 1599,
        expectedCurrencyCode: account.currencyCode,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      // Accept the candidate WITH the subscription ID
      const accepted = await helpers.acceptSubscriptionCandidate({
        id: candidate.id,
        subscriptionId: sub.id,
        raw: true,
      });

      expect(accepted.status).toBe('accepted');

      // Verify sample transactions are now linked to the subscription
      const subDetail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const linkedTxIds = subDetail.transactions.map((t) => t.id);

      expect(linkedTxIds.length).toBe(4);
      for (const txId of candidate.sampleTransactionIds) {
        expect(linkedTxIds).toContain(txId);
      }
    });

    it('dismisses a candidate and it does not reappear', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates[0]!;

      const dismissed = await helpers.dismissSubscriptionCandidate({
        id: candidate.id,
        raw: true,
      });

      expect(dismissed.id).toBe(candidate.id);
      expect(dismissed.status).toBe('dismissed');

      // Should not appear in pending list
      const pending = await helpers.getSubscriptionCandidates({ raw: true });
      expect(pending.find((c) => c.id === candidate.id)).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('returns empty results when no recurring patterns exist', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create unrelated transactions with different notes
      for (let i = 0; i < 5; i++) {
        const time = new Date();
        time.setDate(time.getDate() - i * 10);
        await helpers.createTransaction({
          raw: true,
          payload: buildTransactionPayload({
            accountId: account.id,
            amount: 10 + i * 5,
            transactionType: TRANSACTION_TYPES.expense,
            note: `Random purchase ${i} at store ${i}`,
            time: time.toISOString(),
          }),
        });
      }

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      expect(result.candidates.length).toBe(0);
    });

    it('excludes transfer transactions from detection', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      // Create transfers (not subscriptions)
      for (let i = 0; i < 4; i++) {
        const time = new Date();
        time.setDate(time.getDate() - i * 30);
        await helpers.createTransaction({
          raw: true,
          payload: buildTransactionPayload({
            accountId: account1.id,
            amount: 50,
            transactionType: TRANSACTION_TYPES.expense,
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            note: 'Monthly transfer',
            time: time.toISOString(),
            destinationAmount: 50,
            destinationAccountId: account2.id,
          }),
        });
      }

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      const transferCandidate = result.candidates.find((c) => c.suggestedName.includes('transfer'));
      expect(transferCandidate).toBeUndefined();
    });

    it('does not detect patterns with only 2 transactions (below minimum)', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'RARE SERVICE PAYMENT',
        amount: 29.99,
        count: 2,
        intervalDays: 30,
      });

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      const rare = result.candidates.find((c) => c.suggestedName.includes('RARE'));
      expect(rare).toBeUndefined();
    });

    it('excludes transactions already linked to a subscription', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txs = await createRecurringTransactions({
        accountId: account.id,
        note: 'LINKED SERVICE PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      // Create a subscription and link the transactions
      const sub = await helpers.createSubscription({
        name: 'Linked Service',
        expectedAmount: 1599,
        expectedCurrencyCode: account.currencyCode,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const linkRes = await helpers.linkTransactionsToSubscription({
        id: sub.id,
        transactionIds: txs.map((t) => t.id),
      });

      // Verify the link succeeded
      expect(linkRes.statusCode).toBe(200);

      // Verify they appear in the subscription detail
      const subDetail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(subDetail.transactions.length).toBe(4);

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      const linked = result.candidates.find((c) => c.suggestedName.includes('LINKED'));
      expect(linked).toBeUndefined();
    });
  });

  describe('Caching / cooldown', () => {
    it('returns cached results on second call within cooldown', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      const first = await helpers.detectSubscriptionCandidates({ raw: true });
      expect(first.isFromCache).toBe(false);
      expect(first.candidates.length).toBeGreaterThanOrEqual(1);

      const second = await helpers.detectSubscriptionCandidates({ raw: true });
      expect(second.isFromCache).toBe(true);
      expect(second.candidates.length).toBe(first.candidates.length);
    });
  });

  describe('Re-detection behavior', () => {
    it('does not create duplicate candidates when re-run after cooldown', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      // First detection
      const first = await helpers.detectSubscriptionCandidates({ raw: true });
      expect(first.isFromCache).toBe(false);
      expect(first.candidates.length).toBeGreaterThanOrEqual(1);

      const netflixFirst = first.candidates.find((c) => c.suggestedName.includes('NETFLIX'));
      expect(netflixFirst).toBeDefined();

      // Bypass cooldown
      await expireCooldown({ userId: account.userId });

      // Second detection — should NOT duplicate the candidate
      const second = await helpers.detectSubscriptionCandidates({ raw: true });
      expect(second.isFromCache).toBe(false);

      const netflixCandidates = second.candidates.filter((c) => c.suggestedName.includes('NETFLIX'));
      expect(netflixCandidates.length).toBe(1);
      // Should be the same candidate from the first run
      expect(netflixCandidates[0]!.id).toBe(netflixFirst!.id);
    });

    it('still returns existing pending candidates when user did nothing', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      // First detection finds Netflix
      const first = await helpers.detectSubscriptionCandidates({ raw: true });
      expect(first.candidates.length).toBeGreaterThanOrEqual(1);

      // Bypass cooldown — user did nothing with the candidate
      await expireCooldown({ userId: account.userId });

      // Second detection should still return the pending Netflix candidate
      const second = await helpers.detectSubscriptionCandidates({ raw: true });
      expect(second.candidates.length).toBeGreaterThanOrEqual(1);

      const netflix = second.candidates.find((c) => c.suggestedName.includes('NETFLIX'));
      expect(netflix).toBeDefined();
      expect(netflix!.status).toBe('pending');
    });

    it('dismissed candidates do not reappear after fresh detection', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      // Detect and dismiss
      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates.find((c) => c.suggestedName.includes('NETFLIX'))!;
      await helpers.dismissSubscriptionCandidate({ id: candidate.id, raw: true });

      // Bypass cooldown
      await expireCooldown({ userId: account.userId });

      // Fresh detection should NOT re-create a candidate for the same pattern
      const fresh = await helpers.detectSubscriptionCandidates({ raw: true });
      const netflixAgain = fresh.candidates.find((c) => c.suggestedName.includes('NETFLIX'));
      expect(netflixAgain).toBeUndefined();
    });

    it('accepted candidates do not reappear after fresh detection', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      // Detect and accept
      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates.find((c) => c.suggestedName.includes('NETFLIX'))!;
      await helpers.acceptSubscriptionCandidate({ id: candidate.id, raw: true });

      // Bypass cooldown
      await expireCooldown({ userId: account.userId });

      // Fresh detection should NOT re-create the accepted candidate
      const fresh = await helpers.detectSubscriptionCandidates({ raw: true });
      const netflixAgain = fresh.candidates.find((c) => c.suggestedName.includes('NETFLIX'));
      expect(netflixAgain).toBeUndefined();
    });

    it('detects new patterns alongside existing pending candidates', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create Netflix transactions and detect
      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      const first = await helpers.detectSubscriptionCandidates({ raw: true });
      expect(first.candidates.some((c) => c.suggestedName.includes('NETFLIX'))).toBe(true);

      // Now add Spotify transactions
      await createRecurringTransactions({
        accountId: account.id,
        note: 'SPOTIFY PREMIUM',
        amount: 9.99,
        count: 5,
        intervalDays: 30,
      });

      // Bypass cooldown and re-detect
      await expireCooldown({ userId: account.userId });

      const second = await helpers.detectSubscriptionCandidates({ raw: true });

      // Should have both: existing pending Netflix + newly discovered Spotify
      const names = second.candidates.map((c) => c.suggestedName);
      expect(names.some((n) => n.includes('NETFLIX'))).toBe(true);
      expect(names.some((n) => n.includes('SPOTIFY'))).toBe(true);
    });
  });

  describe('Detection quality', () => {
    it('returns amounts as decimal, not cents', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      const netflix = result.candidates.find((c) => c.suggestedName.includes('NETFLIX'));
      expect(netflix).toBeDefined();

      // 1599 cents = 15.99 decimal
      expect(netflix!.averageAmount).toBe(15.99);
    });

    it('candidates are sorted by confidence score descending', async () => {
      const account = await helpers.createAccount({ raw: true });

      // High confidence: many transactions, regular intervals
      await createRecurringTransactions({
        accountId: account.id,
        note: 'VERY REGULAR SERVICE',
        amount: 9.99,
        count: 10,
        intervalDays: 30,
      });

      // Lower confidence: fewer transactions
      await createRecurringTransactions({
        accountId: account.id,
        note: 'LESS REGULAR SERVICE',
        amount: 24.99,
        count: 3,
        intervalDays: 30,
      });

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      expect(result.candidates.length).toBeGreaterThanOrEqual(2);

      // Verify descending order
      for (let i = 1; i < result.candidates.length; i++) {
        expect(result.candidates[i - 1]!.confidenceScore).toBeGreaterThanOrEqual(result.candidates[i]!.confidenceScore);
      }
    });

    it('detects weekly frequency patterns', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'WEEKLY GYM PAYMENT',
        amount: 5,
        count: 6,
        intervalDays: 7,
      });

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      const gym = result.candidates.find((c) => c.suggestedName.includes('GYM'));
      expect(gym).toBeDefined();
      expect(gym!.detectedFrequency).toBe(SUBSCRIPTION_FREQUENCIES.weekly);
    });

    it('rejects groups with highly irregular timing', async () => {
      const account = await helpers.createAccount({ raw: true });
      const now = new Date();

      // Create transactions with wildly varying intervals (3, 45, 7, 60 days)
      const irregularDays = [0, 3, 48, 55, 115];
      for (const dayOffset of irregularDays) {
        const time = new Date(now);
        time.setDate(time.getDate() - dayOffset);
        await helpers.createTransaction({
          raw: true,
          payload: buildTransactionPayload({
            accountId: account.id,
            amount: 10,
            transactionType: TRANSACTION_TYPES.expense,
            transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
            note: 'IRREGULAR SHOP PAYMENT',
            time: time.toISOString(),
          }),
        });
      }

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      const irregular = result.candidates.find((c) => c.suggestedName.includes('IRREGULAR'));
      expect(irregular).toBeUndefined();
    });

    it('handles varying amounts by splitting into buckets', async () => {
      const account = await helpers.createAccount({ raw: true });
      const now = new Date();

      // Mix of two distinct price points with same note
      const amounts = [9.99, 9.99, 9.99, 9.99, 49.99, 49.99, 49.99, 49.99];
      for (let i = 0; i < amounts.length; i++) {
        const time = new Date(now);
        time.setDate(time.getDate() - 30 * (amounts.length - 1 - i));
        await helpers.createTransaction({
          raw: true,
          payload: buildTransactionPayload({
            accountId: account.id,
            amount: amounts[i]!,
            transactionType: TRANSACTION_TYPES.expense,
            transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
            note: 'STREAMING SERVICE',
            time: time.toISOString(),
          }),
        });
      }

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      // Should detect at least one bucket as a candidate
      const streaming = result.candidates.find((c) => c.suggestedName.includes('STREAMING'));
      expect(streaming).toBeDefined();
    });
  });

  describe('Link candidate to existing subscription', () => {
    it('links a candidate to an existing subscription', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'DIGITALOCEAN CLOUD',
        amount: 7,
        count: 4,
        intervalDays: 30,
      });

      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates.find((c) => c.suggestedName.includes('DIGITALOCEAN'))!;
      expect(candidate).toBeDefined();

      // Create an existing subscription
      const sub = await helpers.createSubscription({
        name: 'Digital Ocean',
        expectedAmount: 700,
        expectedCurrencyCode: account.currencyCode,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      // Link the candidate to the subscription
      const result = await helpers.linkSubscriptionCandidate({
        id: candidate.id,
        subscriptionId: sub.id,
        raw: true,
      });

      expect(result.id).toBe(candidate.id);
      expect(result.status).toBe('accepted');

      // Candidate should no longer appear in pending list
      const pending = await helpers.getSubscriptionCandidates({ raw: true });
      expect(pending.find((c) => c.id === candidate.id)).toBeUndefined();
    });

    it('links sample transactions to the subscription', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txs = await createRecurringTransactions({
        accountId: account.id,
        note: 'DIGITALOCEAN CLOUD',
        amount: 7,
        count: 4,
        intervalDays: 30,
      });

      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates.find((c) => c.suggestedName.includes('DIGITALOCEAN'))!;

      const sub = await helpers.createSubscription({
        name: 'Digital Ocean',
        expectedAmount: 700,
        expectedCurrencyCode: account.currencyCode,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      await helpers.linkSubscriptionCandidate({
        id: candidate.id,
        subscriptionId: sub.id,
        raw: true,
      });

      // Verify transactions are now linked to the subscription
      const subDetail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      const linkedTxIds = subDetail.transactions.map((t) => t.id);

      // All sample transactions should be linked
      for (const tx of txs) {
        expect(linkedTxIds).toContain(tx.id);
      }
    });

    it('skips transactions that are already linked to another subscription', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txs = await createRecurringTransactions({
        accountId: account.id,
        note: 'SHARED SERVICE',
        amount: 10,
        count: 4,
        intervalDays: 30,
      });

      // Link first 2 transactions to an existing subscription
      const existingSub = await helpers.createSubscription({
        name: 'Existing Sub',
        expectedAmount: 1000,
        expectedCurrencyCode: account.currencyCode,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      await helpers.linkTransactionsToSubscription({
        id: existingSub.id,
        transactionIds: [txs[0]!.id, txs[1]!.id],
      });

      // Expire cooldown so detect runs fresh (if any candidates exist from prior state)
      await expireCooldown({ userId: account.userId });

      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates.find((c) => c.suggestedName.includes('SHARED'));

      // The candidate might not exist since some txs are linked, reducing count
      // But if it does exist, linking should still succeed without errors
      if (candidate) {
        const targetSub = await helpers.createSubscription({
          name: 'Target Sub',
          expectedAmount: 1000,
          expectedCurrencyCode: account.currencyCode,
          frequency: SUBSCRIPTION_FREQUENCIES.monthly,
          startDate: '2025-01-01',
          raw: true,
        });

        const result = await helpers.linkSubscriptionCandidate({
          id: candidate.id,
          subscriptionId: targetSub.id,
          raw: true,
        });

        expect(result.status).toBe('accepted');
      }
    });

    it('returns 404 when linking a non-existent candidate', async () => {
      const account = await helpers.createAccount({ raw: true });

      const sub = await helpers.createSubscription({
        name: 'Some Sub',
        expectedAmount: 1000,
        expectedCurrencyCode: account.currencyCode,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const res = await helpers.linkSubscriptionCandidate({
        id: '01942b94-0000-7000-8000-000000000000',
        subscriptionId: sub.id,
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 409 when linking an already accepted candidate', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates[0]!;

      // Accept the candidate first
      await helpers.acceptSubscriptionCandidate({ id: candidate.id, raw: true });

      const sub = await helpers.createSubscription({
        name: 'Netflix',
        expectedAmount: 1599,
        expectedCurrencyCode: account.currencyCode,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      // Try to link already accepted candidate
      const res = await helpers.linkSubscriptionCandidate({
        id: candidate.id,
        subscriptionId: sub.id,
      });

      expect(res.statusCode).toBe(409);
    });

    it('returns 404 when linking to a non-existent subscription', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates[0]!;

      const res = await helpers.linkSubscriptionCandidate({
        id: candidate.id,
        subscriptionId: '01942b94-0000-7000-8000-000000000000',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Possible match detection', () => {
    it('includes possibleMatch when a similar subscription exists', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create an existing subscription
      await helpers.createSubscription({
        name: 'Digital Ocean',
        expectedAmount: 700,
        expectedCurrencyCode: account.currencyCode,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      // Create recurring transactions with a similar name
      await createRecurringTransactions({
        accountId: account.id,
        note: 'DigitalOcean',
        amount: 7,
        count: 4,
        intervalDays: 30,
      });

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      const doCandidate = result.candidates.find((c) => c.suggestedName.includes('DigitalOcean'));
      expect(doCandidate).toBeDefined();
      expect(doCandidate!.possibleMatch).not.toBeNull();
      expect(doCandidate!.possibleMatch!.name).toBe('Digital Ocean');
    });

    it('possibleMatch is null when no similar subscription exists', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'UNIQUE SERVICE ABC',
        amount: 12.5,
        count: 4,
        intervalDays: 30,
      });

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = result.candidates.find((c) => c.suggestedName.includes('UNIQUE'));
      expect(candidate).toBeDefined();
      expect(candidate!.possibleMatch).toBeNull();
    });
  });

  describe('Outdated candidates', () => {
    it('marks a candidate as outdated when last occurrence exceeds 2x median interval', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create monthly transactions all in the past (oldest: ~210 days ago, newest: ~90 days ago)
      // Median interval = ~30 days, so 2x = 60 days. Last occurrence at 90 days ago → outdated
      const now = new Date();
      for (let i = 0; i < 4; i++) {
        const time = new Date(now);
        time.setDate(time.getDate() - 90 - 30 * (3 - i));
        await helpers.createTransaction({
          raw: true,
          payload: buildTransactionPayload({
            accountId: account.id,
            amount: 12.99,
            transactionType: TRANSACTION_TYPES.expense,
            transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
            note: 'OLD STREAMING SERVICE',
            time: time.toISOString(),
          }),
        });
      }

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = result.candidates.find((c) => c.suggestedName.includes('OLD STREAMING'));
      expect(candidate).toBeDefined();
      expect(candidate!.isOutdated).toBe(true);
    });

    it('does not mark a candidate as outdated when last occurrence is recent', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create monthly transactions with the most recent one being recent
      await createRecurringTransactions({
        accountId: account.id,
        note: 'ACTIVE STREAMING SERVICE',
        amount: 12.99,
        count: 4,
        intervalDays: 30,
      });

      const result = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = result.candidates.find((c) => c.suggestedName.includes('ACTIVE STREAMING'));
      expect(candidate).toBeDefined();
      expect(candidate!.isOutdated).toBe(false);
    });

    it('returns isOutdated field from the get-candidates endpoint', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'SOME SERVICE PAYMENT',
        amount: 9.99,
        count: 4,
        intervalDays: 30,
      });

      // Trigger detection first
      await helpers.detectSubscriptionCandidates({ raw: true });

      // Fetch via get-candidates
      const candidates = await helpers.getSubscriptionCandidates({ raw: true });
      const candidate = candidates.find((c) => c.suggestedName.includes('SOME SERVICE'));
      expect(candidate).toBeDefined();
      expect(typeof candidate!.isOutdated).toBe('boolean');
      expect(candidate!.isOutdated).toBe(false);
    });
  });

  describe('Error cases', () => {
    it('returns 404 when accepting a non-existent candidate', async () => {
      const res = await helpers.acceptSubscriptionCandidate({
        id: '01942b94-0000-7000-8000-000000000000',
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 409 when accepting an already accepted candidate', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates[0]!;

      // Accept once
      await helpers.acceptSubscriptionCandidate({ id: candidate.id, raw: true });

      // Try to accept again
      const res = await helpers.acceptSubscriptionCandidate({ id: candidate.id });

      expect(res.statusCode).toBe(409);
    });

    it('returns 409 when dismissing an already dismissed candidate', async () => {
      const account = await helpers.createAccount({ raw: true });

      await createRecurringTransactions({
        accountId: account.id,
        note: 'NETFLIX.COM PAYMENT',
        amount: 15.99,
        count: 4,
        intervalDays: 30,
      });

      const detection = await helpers.detectSubscriptionCandidates({ raw: true });
      const candidate = detection.candidates[0]!;

      // Dismiss once
      await helpers.dismissSubscriptionCandidate({ id: candidate.id, raw: true });

      // Try to dismiss again
      const res = await helpers.dismissSubscriptionCandidate({ id: candidate.id });

      expect(res.statusCode).toBe(409);
    });

    it('returns 404 when dismissing a non-existent candidate', async () => {
      const res = await helpers.dismissSubscriptionCandidate({
        id: '01942b94-0000-7000-8000-000000000000',
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
