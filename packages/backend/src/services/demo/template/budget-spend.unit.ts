import { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';

import type { DemoAccountKey } from '../demo-config';
import { sumSpendByCategoryKey } from './budget-spend';
import { toBaseCurrencyCents } from './fx';
import type { DemoTemplate, DemoTemplateTransaction } from './types';

/**
 * The derived budget limits only land on their intended utilization if this sum
 * counts the same rows the budget card does, so each case here mirrors one rule
 * from `services/budgets/stats.ts`.
 */
describe('sumSpendByCategoryKey', () => {
  const CURRENCY_BY_ACCOUNT_KEY: Partial<Record<DemoAccountKey, string>> = {
    main_checking: 'USD',
    cash: 'PLN',
  };

  const row = (
    overrides: Partial<DemoTemplateTransaction> & Pick<DemoTemplateTransaction, 'categoryKey' | 'amount'>,
  ): DemoTemplateTransaction => ({
    accountKey: 'main_checking',
    transactionType: TRANSACTION_TYPES.expense,
    dayOffset: 5,
    minuteOfDay: 600,
    note: 'test',
    paymentType: PAYMENT_TYPES.debitCard,
    ...overrides,
  });

  const templateOf = (parts: Partial<DemoTemplate>): DemoTemplate => ({
    generatedAt: new Date('2026-01-31T00:00:00Z'),
    transactions: [],
    splits: [],
    refunds: [],
    groups: [],
    subscriptionPayments: [],
    ...parts,
  });

  const sum = (parts: Partial<DemoTemplate>) =>
    sumSpendByCategoryKey({
      template: templateOf(parts),
      windowDays: 30,
      currencyByAccountKey: CURRENCY_BY_ACCOUNT_KEY,
    });

  it('sums expenses per category key', () => {
    const spend = sum({
      transactions: [
        row({ categoryKey: 'food/groceries', amount: 4000 }),
        row({ categoryKey: 'food/groceries', amount: 2500 }),
        row({ categoryKey: 'shopping/clothes-shoes', amount: 9000 }),
      ],
    });

    expect(spend.get('food/groceries')).toBe(6500);
    expect(spend.get('shopping/clothes-shoes')).toBe(9000);
  });

  it('leaves out rows the budget never counts', () => {
    const spend = sum({
      transactions: [
        row({ categoryKey: 'food/groceries', amount: 4000, dayOffset: 31 }),
        row({ categoryKey: 'food/groceries', amount: 800, transactionType: TRANSACTION_TYPES.income }),
        row({
          categoryKey: 'food/groceries',
          amount: 700,
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        }),
      ],
    });

    expect(spend.get('food/groceries')).toBeUndefined();
  });

  it('converts a non-base-currency row at its own day rate', () => {
    const cashRow = row({ accountKey: 'cash', categoryKey: 'food/groceries', amount: 8000, dayOffset: 12 });
    const spend = sum({ transactions: [cashRow] });

    expect(spend.get('food/groceries')).toBe(
      toBaseCurrencyCents({ amount: 8000, currencyCode: 'PLN', dayOffset: 12, spotRate: 4 }),
    );
  });

  describe('split transactions', () => {
    it('counts the split rows instead of the parent, so no amount lands twice', () => {
      const spend = sum({
        transactions: [row({ ref: 'shop-1', categoryKey: 'food/groceries', amount: 10000 })],
        splits: [
          { transactionRef: 'shop-1', categoryKey: 'shopping/home-garden', amount: 3000 },
          { transactionRef: 'shop-1', categoryKey: 'shopping/drugstore-chemist', amount: 1200 },
          { transactionRef: 'shop-1', categoryKey: 'food/groceries', amount: 5800 },
        ],
      });

      // The parent contributed nothing of its own: its groceries figure is the
      // groceries split, not the whole receipt.
      expect(spend.get('food/groceries')).toBe(5800);
      expect(spend.get('shopping/home-garden')).toBe(3000);
      expect(spend.get('shopping/drugstore-chemist')).toBe(1200);
    });

    it('ignores splits whose parent falls outside the window', () => {
      const spend = sum({
        transactions: [row({ ref: 'shop-1', categoryKey: 'food/groceries', amount: 10000, dayOffset: 40 })],
        splits: [{ transactionRef: 'shop-1', categoryKey: 'shopping/home-garden', amount: 10000 }],
      });

      expect(spend.size).toBe(0);
    });
  });

  describe('refund pairs', () => {
    it('nets the refund out of the category the original was counted in', () => {
      const spend = sum({
        transactions: [
          row({ ref: 'purchase-1', categoryKey: 'shopping/clothes-shoes', amount: 12000, dayOffset: 10 }),
          row({ categoryKey: 'shopping/clothes-shoes', amount: 5000 }),
          row({
            ref: 'refund-1',
            categoryKey: 'income/refunds',
            amount: 12000,
            dayOffset: 4,
            transactionType: TRANSACTION_TYPES.income,
          }),
        ],
        refunds: [{ originalRef: 'purchase-1', refundRef: 'refund-1' }],
      });

      expect(spend.get('shopping/clothes-shoes')).toBe(5000);
    });

    it('nets a refund whose own row sits outside the window, as the budget stats do', () => {
      const spend = sum({
        transactions: [
          row({ ref: 'purchase-1', categoryKey: 'shopping/clothes-shoes', amount: 12000, dayOffset: 10 }),
          row({
            ref: 'refund-1',
            categoryKey: 'income/refunds',
            amount: 12000,
            dayOffset: 45,
            transactionType: TRANSACTION_TYPES.income,
          }),
        ],
        refunds: [{ originalRef: 'purchase-1', refundRef: 'refund-1' }],
      });

      expect(spend.get('shopping/clothes-shoes')).toBe(0);
    });

    it('leaves the sum alone when the original is outside the window', () => {
      const spend = sum({
        transactions: [
          row({ ref: 'purchase-1', categoryKey: 'shopping/clothes-shoes', amount: 12000, dayOffset: 40 }),
          row({ categoryKey: 'shopping/clothes-shoes', amount: 5000 }),
          row({
            ref: 'refund-1',
            categoryKey: 'income/refunds',
            amount: 12000,
            dayOffset: 30,
            transactionType: TRANSACTION_TYPES.income,
          }),
        ],
        refunds: [{ originalRef: 'purchase-1', refundRef: 'refund-1' }],
      });

      expect(spend.get('shopping/clothes-shoes')).toBe(5000);
    });

    it('spreads a partial refund of a split parent across the split categories', () => {
      const spend = sum({
        transactions: [
          row({ ref: 'shop-1', categoryKey: 'food/groceries', amount: 10000 }),
          row({
            ref: 'refund-1',
            categoryKey: 'income/refunds',
            amount: 2000,
            dayOffset: 2,
            transactionType: TRANSACTION_TYPES.income,
          }),
        ],
        splits: [
          { transactionRef: 'shop-1', categoryKey: 'shopping/home-garden', amount: 4000 },
          { transactionRef: 'shop-1', categoryKey: 'food/groceries', amount: 6000 },
        ],
        refunds: [{ originalRef: 'shop-1', refundRef: 'refund-1' }],
      });

      expect(spend.get('shopping/home-garden')).toBe(3200);
      expect(spend.get('food/groceries')).toBe(4800);
    });
  });
});
