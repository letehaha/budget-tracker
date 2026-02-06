import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Subscriptions', () => {
  describe('CRUD', () => {
    it('creates a subscription', async () => {
      const sub = await helpers.createSubscription({
        name: 'Netflix',
        expectedAmount: 1599,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      expect(sub.name).toBe('Netflix');
      expect(sub.frequency).toBe(SUBSCRIPTION_FREQUENCIES.monthly);
      expect(sub.isActive).toBe(true);
    });

    it('creates a subscription with all optional fields', async () => {
      const account = await helpers.createAccount({ raw: true });

      const sub = await helpers.createSubscription({
        name: 'Spotify',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 999,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-15',
        endDate: '2026-01-15',
        accountId: account.id,
        categoryId: 1,
        matchingRules: {
          rules: [{ field: 'note', operator: 'contains_any', value: ['spotify'] }],
        },
        notes: 'Family plan',
        raw: true,
      });

      expect(sub.name).toBe('Spotify');
      expect(sub.expectedAmount).toBe(999);
      expect(sub.accountId).toBe(account.id);
      expect(sub.categoryId).toBe(1);
      expect(sub.notes).toBe('Family plan');
    });

    it('lists subscriptions', async () => {
      await helpers.createSubscription({
        name: 'Sub A',
        expectedAmount: 1000,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });
      await helpers.createSubscription({
        name: 'Sub B',
        expectedAmount: 500,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.weekly,
        startDate: '2025-02-01',
        raw: true,
      });

      const list = await helpers.getSubscriptions({ raw: true });
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('gets subscription by id', async () => {
      const sub = await helpers.createSubscription({
        name: 'Detail Sub',
        expectedAmount: 1599,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.name).toBe('Detail Sub');
      expect(detail.transactions).toBeDefined();
      expect(detail.nextExpectedDate).toBeDefined();
    });

    it('updates a subscription', async () => {
      const sub = await helpers.createSubscription({
        name: 'Original',
        expectedAmount: 999,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const updated = await helpers.updateSubscription({
        id: sub.id,
        name: 'Updated',
        frequency: SUBSCRIPTION_FREQUENCIES.quarterly,
        raw: true,
      });

      expect(updated.name).toBe('Updated');
      expect(updated.frequency).toBe(SUBSCRIPTION_FREQUENCIES.quarterly);
    });

    it('deletes a subscription', async () => {
      const sub = await helpers.createSubscription({
        name: 'To Delete',
        expectedAmount: 999,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const res = await helpers.deleteSubscription({ id: sub.id });
      expect(res.statusCode).toBe(200);

      const getRes = await helpers.getSubscriptionById({ id: sub.id });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe('Transaction Linking', () => {
    it('manually links transactions to a subscription', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Link Test',
        expectedAmount: 1500,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1500,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-01-15T10:00:00Z',
        }),
        raw: true,
      });

      const linkRes = await helpers.linkTransactionsToSubscription({
        id: sub.id,
        transactionIds: [tx.id],
        raw: true,
      });

      expect(linkRes.linked).toBe(1);

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.transactions.length).toBe(1);
      expect(detail.transactions[0]!.id).toBe(tx.id);
    });

    it('prevents linking a transaction to two subscriptions', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub1 = await helpers.createSubscription({
        name: 'Sub 1',
        expectedAmount: 1500,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });
      const sub2 = await helpers.createSubscription({
        name: 'Sub 2',
        expectedAmount: 1500,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1500,
        }),
        raw: true,
      });

      await helpers.linkTransactionsToSubscription({
        id: sub1.id,
        transactionIds: [tx.id],
        raw: true,
      });

      const res = await helpers.linkTransactionsToSubscription({
        id: sub2.id,
        transactionIds: [tx.id],
      });

      expect(res.statusCode).toBe(409);
    });

    it('unlinks transactions (soft-unlink with status)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Unlink Test',
        expectedAmount: 1500,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1500,
        }),
        raw: true,
      });

      await helpers.linkTransactionsToSubscription({
        id: sub.id,
        transactionIds: [tx.id],
        raw: true,
      });

      const unlinkRes = await helpers.unlinkTransactionsFromSubscription({
        id: sub.id,
        transactionIds: [tx.id],
        raw: true,
      });

      expect(unlinkRes.unlinked).toBe(1);

      // After unlinking, the transaction should not appear in subscription details
      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.transactions.length).toBe(0);
    });

    it('re-links previously unlinked transactions', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Relink Test',
        expectedAmount: 1500,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1500,
        }),
        raw: true,
      });

      // Link → Unlink → Re-link
      await helpers.linkTransactionsToSubscription({
        id: sub.id,
        transactionIds: [tx.id],
        raw: true,
      });

      await helpers.unlinkTransactionsFromSubscription({
        id: sub.id,
        transactionIds: [tx.id],
        raw: true,
      });

      const reLinkRes = await helpers.linkTransactionsToSubscription({
        id: sub.id,
        transactionIds: [tx.id],
        raw: true,
      });

      expect(reLinkRes.linked).toBe(1);

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.transactions.length).toBe(1);
    });

    it('unlinked transactions are excluded from suggestions', async () => {
      const account = await helpers.createAccount({ raw: true });

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1500,
          note: 'netflix payment',
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-06-15T10:00:00Z',
        }),
        raw: true,
      });

      const sub = await helpers.createSubscription({
        name: 'Netflix',
        expectedAmount: 1500,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        matchingRules: {
          rules: [{ field: 'note', operator: 'contains_any', value: ['netflix'] }],
        },
        raw: true,
      });

      // Link then unlink
      await helpers.linkTransactionsToSubscription({
        id: sub.id,
        transactionIds: [tx.id],
        raw: true,
      });
      await helpers.unlinkTransactionsFromSubscription({
        id: sub.id,
        transactionIds: [tx.id],
        raw: true,
      });

      // Suggest matches should NOT include the unlinked transaction
      const suggestions = await helpers.getSuggestedMatches({ id: sub.id, raw: true });
      const suggestedIds = suggestions.map((s: { id: number }) => s.id);
      expect(suggestedIds).not.toContain(tx.id);
    });
  });

  describe('Subscription list counts', () => {
    it('linkedTransactionsCount excludes unlinked transactions', async () => {
      const account = await helpers.createAccount({ raw: true });
      const sub = await helpers.createSubscription({
        name: 'Count Test',
        expectedAmount: 1000,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const [tx1] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 1000 }),
        raw: true,
      });
      const [tx2] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 2000 }),
        raw: true,
      });

      await helpers.linkTransactionsToSubscription({
        id: sub.id,
        transactionIds: [tx1.id, tx2.id],
        raw: true,
      });

      // Unlink one
      await helpers.unlinkTransactionsFromSubscription({
        id: sub.id,
        transactionIds: [tx1.id],
        raw: true,
      });

      const list = await helpers.getSubscriptions({ raw: true });
      const found = list.find((s: { id: string }) => s.id === sub.id);
      expect((found as Record<string, unknown>).linkedTransactionsCount).toBe(1);
    });
  });

  describe('Suggest historical matches', () => {
    it('suggests transactions matching rules', async () => {
      const account = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1500,
          note: 'NETFLIX subscription',
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-06-10T10:00:00Z',
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 2000,
          note: 'Grocery store',
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-06-11T10:00:00Z',
        }),
        raw: true,
      });

      const sub = await helpers.createSubscription({
        name: 'Netflix',
        expectedAmount: 1500,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        matchingRules: {
          rules: [{ field: 'note', operator: 'contains_any', value: ['netflix'] }],
        },
        raw: true,
      });

      const suggestions = await helpers.getSuggestedMatches({ id: sub.id, raw: true });
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions.every((s: { note: string | null }) => s.note?.toLowerCase().includes('netflix'))).toBe(true);
    });

    it('suggests cross-currency transactions matching amount rules after conversion', async () => {
      // Test exchange rate in seeded data: 1 USD ≈ 41.43 UAH
      const UAH_PER_USD = 41.429899;

      // Create an account in UAH (different from the subscription's rule currency)
      const { account } = await helpers.createAccountWithNewCurrency({ currency: 'UAH' });

      // Transaction: $9.99 equivalent in UAH = ~413.89 UAH
      const uahAmount = Math.round(999 * UAH_PER_USD) / 100; // Convert USD cents to UAH decimal
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: uahAmount,
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-06-10T10:00:00Z',
        }),
        raw: true,
      });

      // Create subscription with amount rule in USD (900-1100 cents = $9-$11)
      // The transaction is in UAH but should match after conversion
      const sub = await helpers.createSubscription({
        name: 'Apple TV',
        expectedAmount: 999, // $9.99 in cents
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 900, max: 1100 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      // The historical match suggestions should include the UAH transaction
      // after converting its amount to USD and seeing it falls within 900-1100 cents
      const suggestions = await helpers.getSuggestedMatches({ id: sub.id, raw: true });
      const suggestedIds = suggestions.map((s: { id: number }) => s.id);

      expect(suggestedIds).toContain(tx.id);
    });
  });

  describe('Summary', () => {
    describe('GET /subscriptions/summary', () => {
      it('returns summary with correct monthly and yearly cost', async () => {
        await helpers.createSubscription({
          name: 'Netflix',
          expectedAmount: 1500,
          expectedCurrencyCode: global.BASE_CURRENCY_CODE,
          frequency: SUBSCRIPTION_FREQUENCIES.monthly,
          startDate: '2025-01-01',
          raw: true,
        });

        const summary = await helpers.getSubscriptionsSummary({ raw: true });

        expect(summary.activeCount).toBe(1);
        expect(summary.estimatedMonthlyCost).toBe(15);
        expect(summary.projectedYearlyCost).toBe(180);
        expect(summary.currencyCode).toBe(global.BASE_CURRENCY_CODE);
      });

      it('returns zeros when no active subscriptions exist', async () => {
        const summary = await helpers.getSubscriptionsSummary({ raw: true });

        expect(summary.activeCount).toBe(0);
        expect(summary.estimatedMonthlyCost).toBe(0);
        expect(summary.projectedYearlyCost).toBe(0);
      });

      it('returns validation error for invalid type query param', async () => {
        const res = await helpers.getSubscriptionsSummary({ type: 'invalid_type' });
        expect(res.statusCode).toBe(422);
      });

      it('filters by subscription type', async () => {
        await helpers.createSubscription({
          name: 'Netflix',
          type: SUBSCRIPTION_TYPES.subscription,
          expectedAmount: 1500,
          expectedCurrencyCode: global.BASE_CURRENCY_CODE,
          frequency: SUBSCRIPTION_FREQUENCIES.monthly,
          startDate: '2025-01-01',
          raw: true,
        });
        await helpers.createSubscription({
          name: 'Electricity',
          type: SUBSCRIPTION_TYPES.bill,
          expectedAmount: 10000,
          expectedCurrencyCode: global.BASE_CURRENCY_CODE,
          frequency: SUBSCRIPTION_FREQUENCIES.monthly,
          startDate: '2025-01-01',
          raw: true,
        });

        const all = await helpers.getSubscriptionsSummary({ raw: true });
        expect(all.activeCount).toBe(2);
        expect(all.estimatedMonthlyCost).toBe(115);

        const subsOnly = await helpers.getSubscriptionsSummary({
          type: SUBSCRIPTION_TYPES.subscription,
          raw: true,
        });
        expect(subsOnly.activeCount).toBe(1);
        expect(subsOnly.estimatedMonthlyCost).toBe(15);

        const billsOnly = await helpers.getSubscriptionsSummary({
          type: SUBSCRIPTION_TYPES.bill,
          raw: true,
        });
        expect(billsOnly.activeCount).toBe(1);
        expect(billsOnly.estimatedMonthlyCost).toBe(100);
      });

      it('excludes inactive subscriptions', async () => {
        const sub = await helpers.createSubscription({
          name: 'Paused Sub',
          expectedAmount: 2000,
          expectedCurrencyCode: global.BASE_CURRENCY_CODE,
          frequency: SUBSCRIPTION_FREQUENCIES.monthly,
          startDate: '2025-01-01',
          raw: true,
        });

        await helpers.toggleSubscriptionActive({ id: sub.id, isActive: false, raw: true });

        const summary = await helpers.getSubscriptionsSummary({ raw: true });
        expect(summary.activeCount).toBe(0);
        expect(summary.estimatedMonthlyCost).toBe(0);
      });

      it('excludes subscriptions without expectedAmount', async () => {
        await helpers.createSubscription({
          name: 'No Amount Sub',
          frequency: SUBSCRIPTION_FREQUENCIES.monthly,
          startDate: '2025-01-01',
          raw: true,
        });

        const summary = await helpers.getSubscriptionsSummary({ raw: true });
        expect(summary.activeCount).toBe(0);
        expect(summary.estimatedMonthlyCost).toBe(0);
      });

      it('normalizes annual frequency to monthly', async () => {
        await helpers.createSubscription({
          name: 'Annual Sub',
          expectedAmount: 12000,
          expectedCurrencyCode: global.BASE_CURRENCY_CODE,
          frequency: SUBSCRIPTION_FREQUENCIES.annual,
          startDate: '2025-01-01',
          raw: true,
        });

        const summary = await helpers.getSubscriptionsSummary({ raw: true });
        expect(summary.activeCount).toBe(1);
        // 12000 cents = $120/year → $10/month
        expect(summary.estimatedMonthlyCost).toBe(10);
        expect(summary.projectedYearlyCost).toBe(120);
      });
    });
  });

  describe('Auto-matching on transaction creation', () => {
    it('auto-matches a new transaction to subscription via rules', async () => {
      const account = await helpers.createAccount({ raw: true });

      const sub = await helpers.createSubscription({
        name: 'Netflix',
        expectedAmount: 1599,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        matchingRules: {
          rules: [{ field: 'note', operator: 'contains_any', value: ['netflix'] }],
        },
        raw: true,
      });

      // Create a transaction with matching note
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1599,
          note: 'Netflix monthly payment',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.transactions.length).toBe(1);
      expect(detail.transactions[0]!.note).toContain('Netflix');
    });

    it('does not auto-match when note does not match rules', async () => {
      const account = await helpers.createAccount({ raw: true });

      const sub = await helpers.createSubscription({
        name: 'Netflix',
        expectedAmount: 1599,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        matchingRules: {
          rules: [{ field: 'note', operator: 'contains_any', value: ['netflix'] }],
        },
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1599,
          note: 'Spotify premium',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.transactions.length).toBe(0);
    });

    it('applies subscription category to auto-matched transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await helpers.addCustomCategory({ raw: true, name: 'Entertainment', color: '#FF5733' });

      const sub = await helpers.createSubscription({
        name: 'Netflix',
        expectedAmount: 1599,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        categoryId: category.id,
        matchingRules: {
          rules: [{ field: 'note', operator: 'contains_any', value: ['netflix'] }],
        },
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1599,
          note: 'Netflix payment',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.transactions.length).toBe(1);
      expect(detail.transactions[0]!.categoryId).toBe(category.id);
    });

    it('does not re-match a transaction that was previously unlinked', async () => {
      const account = await helpers.createAccount({ raw: true });

      const sub = await helpers.createSubscription({
        name: 'Netflix',
        expectedAmount: 1599,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        matchingRules: {
          rules: [{ field: 'note', operator: 'contains_any', value: ['netflix'] }],
        },
        raw: true,
      });

      // Create and auto-match
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1599,
          note: 'Netflix payment',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      // Verify it was matched
      let detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.transactions.length).toBe(1);

      // Unlink it
      await helpers.unlinkTransactionsFromSubscription({
        id: sub.id,
        transactionIds: [tx.id],
        raw: true,
      });

      detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      expect(detail.transactions.length).toBe(0);

      // Create another transaction — the unlinked one should stay unlinked,
      // but a new matching transaction should still be matched
      const [tx2] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1599,
          note: 'Netflix payment 2',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
      // Should only contain the new tx, not the previously unlinked one
      expect(detail.transactions.length).toBe(1);
      expect(detail.transactions[0]!.id).toBe(tx2.id);
    });
  });
});
