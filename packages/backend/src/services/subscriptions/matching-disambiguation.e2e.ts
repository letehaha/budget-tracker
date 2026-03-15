import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

/**
 * Tests for the subscription matching engine's disambiguation logic.
 *
 * Scenario: Multiple Apple subscriptions with overlapping note rules ("apple")
 * but different expected amounts. Transactions come in UAH (cross-currency),
 * so the engine must convert amounts before comparing.
 *
 * Test exchange rate: 1 USD ≈ 41.43 UAH (from seeded test data)
 *
 * IMPORTANT: The API accepts amounts in **decimal** format (e.g., 9.99 for $9.99),
 * while DB stores amounts in **cents** (e.g., 999). Subscription expectedAmount
 * and matching rule min/max are stored in cents. The helper below converts
 * USD cents to UAH decimal (API format).
 */

const UAH_PER_USD = 41.429899;

/** Convert USD cents to UAH decimal (API format) using the test exchange rate */
function usdCentsToUahDecimal(usdCents: number): number {
  // USD cents → UAH cents → UAH decimal
  // Example: 999 ($9.99) × 41.43 ≈ 41389 UAH cents = 413.89 UAH
  return Math.round(usdCents * UAH_PER_USD) / 100;
}

/** Convert cents to decimal (API format) */
function centsToDecimal(cents: number): number {
  return cents / 100;
}

describe('Subscription matching disambiguation', () => {
  describe('cross-currency matching with multiple overlapping subscriptions', () => {
    it('matches each transaction to the correct Apple subscription based on amount', async () => {
      const { account } = await helpers.createAccountWithNewCurrency({ currency: 'UAH' });

      // Create 4 Apple subscriptions with different expected amounts, all matching "apple" notes
      const appleOne = await helpers.createSubscription({
        name: 'Apple One',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 1999,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 1900, max: 2100 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      const iCloud = await helpers.createSubscription({
        name: 'iCloud',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 299,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 250, max: 350 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      const appleTv = await helpers.createSubscription({
        name: 'Apple TV',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 999,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 900, max: 1100 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      const appleMusic = await helpers.createSubscription({
        name: 'Apple Music',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 1099,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 1000, max: 1200 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      // Create transactions in UAH for each subscription's USD equivalent
      // API amounts are in decimal format (e.g., 413.88 means 413.88 UAH)
      // iCloud: $2.99 → ~123.88 UAH
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: usdCentsToUahDecimal(299),
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      // Apple TV: $9.99 → ~413.89 UAH
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: usdCentsToUahDecimal(999),
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      // Apple Music: $10.99 → ~455.31 UAH
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: usdCentsToUahDecimal(1099),
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      // Apple One: $19.99 → ~828.19 UAH
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: usdCentsToUahDecimal(1999),
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      // Verify each subscription matched exactly one transaction
      const iCloudDetail = await helpers.getSubscriptionById({ id: iCloud.id, raw: true });
      expect(iCloudDetail.transactions.length).toBe(1);

      const appleTvDetail = await helpers.getSubscriptionById({ id: appleTv.id, raw: true });
      expect(appleTvDetail.transactions.length).toBe(1);

      const appleMusicDetail = await helpers.getSubscriptionById({ id: appleMusic.id, raw: true });
      expect(appleMusicDetail.transactions.length).toBe(1);

      const appleOneDetail = await helpers.getSubscriptionById({ id: appleOne.id, raw: true });
      expect(appleOneDetail.transactions.length).toBe(1);
    });

    it('disambiguates by best amount fit when amount ranges overlap', async () => {
      const { account } = await helpers.createAccountWithNewCurrency({ currency: 'UAH' });

      // Apple TV: expected $9.99, range 900-1200
      const appleTv = await helpers.createSubscription({
        name: 'Apple TV',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 999,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 900, max: 1200 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      // Apple Music: expected $10.99, range 1000-1200 (overlaps with Apple TV)
      const appleMusic = await helpers.createSubscription({
        name: 'Apple Music',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 1099,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 1000, max: 1200 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      // Transaction for exactly $10.99 equivalent — both rules match, but Apple Music
      // should win because $10.99 is closer to its expectedAmount ($10.99) than Apple TV's ($9.99)
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: usdCentsToUahDecimal(1099),
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const appleMusicDetail = await helpers.getSubscriptionById({ id: appleMusic.id, raw: true });
      expect(appleMusicDetail.transactions.length).toBe(1);

      const appleTvDetail = await helpers.getSubscriptionById({ id: appleTv.id, raw: true });
      expect(appleTvDetail.transactions.length).toBe(0);
    });

    it('subscription with amount rule wins over subscription with only note rule', async () => {
      const { account } = await helpers.createAccountWithNewCurrency({ currency: 'UAH' });

      // Generic "Apple" subscription — note rule only, no amount
      const genericApple = await helpers.createSubscription({
        name: 'Apple Generic',
        type: SUBSCRIPTION_TYPES.bill,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [{ field: 'note', operator: 'contains_any', value: ['apple'] }],
        },
        raw: true,
      });

      // Apple TV — note + amount rules
      const appleTv = await helpers.createSubscription({
        name: 'Apple TV',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 999,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 900, max: 1100 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      // Transaction matching Apple TV's amount → Apple TV should win (higher score from amount match)
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: usdCentsToUahDecimal(999),
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const appleTvDetail = await helpers.getSubscriptionById({ id: appleTv.id, raw: true });
      expect(appleTvDetail.transactions.length).toBe(1);

      const genericDetail = await helpers.getSubscriptionById({ id: genericApple.id, raw: true });
      expect(genericDetail.transactions.length).toBe(0);
    });

    it('note-only subscription catches transactions that do not match any amount range', async () => {
      const { account } = await helpers.createAccountWithNewCurrency({ currency: 'UAH' });

      // Generic "Apple" subscription — note rule only
      const genericApple = await helpers.createSubscription({
        name: 'Apple Generic',
        type: SUBSCRIPTION_TYPES.bill,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [{ field: 'note', operator: 'contains_any', value: ['apple'] }],
        },
        raw: true,
      });

      // Apple TV — note + amount rules (tight range: $9-$11)
      await helpers.createSubscription({
        name: 'Apple TV',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 999,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 900, max: 1100 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      // Transaction for $50 equivalent — doesn't match Apple TV's amount range,
      // but does match the generic note-only subscription
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: usdCentsToUahDecimal(5000),
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const genericDetail = await helpers.getSubscriptionById({ id: genericApple.id, raw: true });
      expect(genericDetail.transactions.length).toBe(1);
    });

    it('does not re-match an already linked transaction', async () => {
      const { account } = await helpers.createAccountWithNewCurrency({ currency: 'UAH' });

      const appleTv = await helpers.createSubscription({
        name: 'Apple TV',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 999,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 900, max: 1100 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      // First transaction — should auto-match
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: usdCentsToUahDecimal(999),
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      let detail = await helpers.getSubscriptionById({ id: appleTv.id, raw: true });
      expect(detail.transactions.length).toBe(1);

      // Second transaction — should also auto-match (separate transaction)
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: usdCentsToUahDecimal(999),
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      detail = await helpers.getSubscriptionById({ id: appleTv.id, raw: true });
      expect(detail.transactions.length).toBe(2);
    });

    it('same-currency matching still works correctly', async () => {
      // Use a USD account to test same-currency path
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ currencyCode: 'USD' }),
        raw: true,
      });
      // Ensure user has USD currency
      await helpers.addUserCurrencies({ currencyCodes: ['USD'] });

      const appleTv = await helpers.createSubscription({
        name: 'Apple TV',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 999,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 900, max: 1100 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      const appleMusic = await helpers.createSubscription({
        name: 'Apple Music',
        type: SUBSCRIPTION_TYPES.subscription,
        expectedAmount: 1099,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        accountId: account.id,
        matchingRules: {
          rules: [
            { field: 'note', operator: 'contains_any', value: ['apple'] },
            { field: 'amount', operator: 'between', value: { min: 1000, max: 1200 }, currencyCode: 'USD' },
          ],
        },
        raw: true,
      });

      // $9.99 transaction — should match Apple TV
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: centsToDecimal(999),
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      // $10.99 transaction — should match Apple Music
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: centsToDecimal(1099),
          note: 'APPLE.COM/BILL',
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const appleTvDetail = await helpers.getSubscriptionById({ id: appleTv.id, raw: true });
      expect(appleTvDetail.transactions.length).toBe(1);

      const appleMusicDetail = await helpers.getSubscriptionById({ id: appleMusic.id, raw: true });
      expect(appleMusicDetail.transactions.length).toBe(1);
    });
  });
});
