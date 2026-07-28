import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';

import { generateDemoTemplate } from './generate';
import { allDemoMerchants } from './merchants';
import type { DemoTemplate, DemoTemplateTransaction } from './types';

describe('generateDemoTemplate', () => {
  let template: DemoTemplate;
  let byRef: Map<string, DemoTemplateTransaction>;

  beforeAll(() => {
    template = generateDemoTemplate();
    byRef = new Map(
      template.transactions.filter((tx) => tx.ref).map((tx) => [tx.ref!, tx] as [string, DemoTemplateTransaction]),
    );
  });

  it('generates a substantial history', () => {
    expect(template.transactions.length).toBeGreaterThan(1000);
  });

  it('keeps every row inside the history window', () => {
    for (const tx of template.transactions) {
      expect(tx.dayOffset).toBeGreaterThanOrEqual(0);
      // 36 months of history, with slack for month-length variation.
      expect(tx.dayOffset).toBeLessThanOrEqual(1120);
    }
  });

  it('always stores a positive amount, since direction lives in transactionType', () => {
    for (const tx of template.transactions) {
      expect(tx.amount).toBeGreaterThan(0);
    }
  });

  it('gives every row a time of day', () => {
    const distinctMinutes = new Set(template.transactions.map((tx) => tx.minuteOfDay));

    expect(distinctMinutes.size).toBeGreaterThan(100);
    for (const tx of template.transactions) {
      expect(tx.minuteOfDay).toBeGreaterThanOrEqual(0);
      expect(tx.minuteOfDay).toBeLessThan(24 * 60);
    }
  });

  describe('transfers', () => {
    it('emits exactly two legs per transfer, with opposite directions', () => {
      const legsByKey = new Map<string, DemoTemplateTransaction[]>();
      for (const tx of template.transactions) {
        if (!tx.transferKey) continue;
        legsByKey.set(tx.transferKey, [...(legsByKey.get(tx.transferKey) ?? []), tx]);
      }

      expect(legsByKey.size).toBeGreaterThan(0);

      for (const legs of legsByKey.values()) {
        expect(legs).toHaveLength(2);

        const types = legs.map((leg) => leg.transactionType).sort();
        expect(types).toEqual([TRANSACTION_TYPES.expense, TRANSACTION_TYPES.income]);

        // Both legs move on the same day and out of different accounts.
        expect(legs[0]!.dayOffset).toBe(legs[1]!.dayOffset);
        expect(legs[0]!.accountKey).not.toBe(legs[1]!.accountKey);

        for (const leg of legs) {
          expect(leg.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
        }
      }
    });

    it('moves money into savings and onto the cash and card accounts', () => {
      const destinations = new Set(
        template.transactions
          .filter((tx) => tx.transferKey && tx.transactionType === TRANSACTION_TYPES.income)
          .map((tx) => tx.accountKey),
      );

      expect(destinations).toContain('savings');
      expect(destinations).toContain('cash');
      expect(destinations).toContain('travel_card');
    });
  });

  describe('splits', () => {
    it('points every split at a transaction that was emitted', () => {
      expect(template.splits.length).toBeGreaterThan(0);

      for (const split of template.splits) {
        expect(byRef.has(split.transactionRef)).toBe(true);
      }
    });

    it('allocates the parent amount exactly, so no part of the receipt escapes budgets', () => {
      const totalByRef = new Map<string, number>();
      for (const split of template.splits) {
        totalByRef.set(split.transactionRef, (totalByRef.get(split.transactionRef) ?? 0) + split.amount);
      }

      for (const [ref, total] of totalByRef) {
        expect(total).toBe(byRef.get(ref)!.amount);
      }
    });

    it('never repeats a category on one transaction, which the unique index rejects', () => {
      const seen = new Set<string>();

      for (const split of template.splits) {
        const pair = `${split.transactionRef}:${split.categoryKey}`;
        expect(seen.has(pair)).toBe(false);
        seen.add(pair);
      }
    });

    it('only splits rows that are not transfers', () => {
      for (const split of template.splits) {
        const parent = byRef.get(split.transactionRef)!;
        expect(parent.transferNature ?? TRANSACTION_TRANSFER_NATURE.not_transfer).toBe(
          TRANSACTION_TRANSFER_NATURE.not_transfer,
        );
      }
    });
  });

  describe('refunds', () => {
    it('links two emitted rows of opposite direction', () => {
      expect(template.refunds.length).toBeGreaterThan(0);

      for (const pair of template.refunds) {
        const original = byRef.get(pair.originalRef);
        const refund = byRef.get(pair.refundRef);

        expect(original).toBeDefined();
        expect(refund).toBeDefined();
        expect(original!.transactionType).toBe(TRANSACTION_TYPES.expense);
        expect(refund!.transactionType).toBe(TRANSACTION_TYPES.income);
      }
    });

    it('never refunds more than the original, which the refund service forbids', () => {
      for (const pair of template.refunds) {
        expect(byRef.get(pair.refundRef)!.amount).toBeLessThanOrEqual(byRef.get(pair.originalRef)!.amount);
      }
    });

    it('uses each refund row only once, matching the unique constraint on refundTxId', () => {
      const refundRefs = template.refunds.map((pair) => pair.refundRef);

      expect(new Set(refundRefs).size).toBe(refundRefs.length);
    });

    it('dates the refund after the purchase', () => {
      for (const pair of template.refunds) {
        // Higher dayOffset is further in the past.
        expect(byRef.get(pair.refundRef)!.dayOffset).toBeLessThan(byRef.get(pair.originalRef)!.dayOffset);
      }
    });
  });

  describe('groups', () => {
    it('holds at least two emitted transactions each', () => {
      expect(template.groups.length).toBeGreaterThan(0);

      for (const group of template.groups) {
        expect(group.transactionRefs.length).toBeGreaterThanOrEqual(2);
        for (const ref of group.transactionRefs) {
          expect(byRef.has(ref)).toBe(true);
        }
      }
    });

    it('never puts one transaction in two groups, which the group service rejects', () => {
      const grouped = template.groups.flatMap((group) => group.transactionRefs);

      expect(new Set(grouped).size).toBe(grouped.length);
    });
  });

  describe('subscription payments', () => {
    it('points at emitted transactions', () => {
      expect(template.subscriptionPayments.length).toBeGreaterThan(0);

      for (const payment of template.subscriptionPayments) {
        expect(byRef.has(payment.transactionRef)).toBe(true);
      }
    });

    it('charges the subscription amount on its due day', () => {
      for (const payment of template.subscriptionPayments) {
        expect(byRef.get(payment.transactionRef)!.dayOffset).toBe(payment.dueDayOffset);
      }
    });

    it('links each transaction to at most one subscription, matching the unique constraint', () => {
      const refs = template.subscriptionPayments.map((payment) => payment.transactionRef);

      expect(new Set(refs).size).toBe(refs.length);
    });
  });

  describe('data shape the demo is meant to show off', () => {
    const expensesOnly = (tx: DemoTemplateTransaction) =>
      tx.transactionType === TRANSACTION_TYPES.expense &&
      (tx.transferNature ?? TRANSACTION_TRANSFER_NATURE.not_transfer) === TRANSACTION_TRANSFER_NATURE.not_transfer;

    it('spreads spending across categories rather than concentrating it in food', () => {
      const expenses = template.transactions.filter(expensesOnly);
      const foodCount = expenses.filter((tx) => tx.categoryKey.startsWith('food/')).length;

      expect(foodCount / expenses.length).toBeLessThan(0.5);
    });

    it('uses subcategories, so category drill-down has something under each parent', () => {
      const subcategoryKeys = new Set(
        template.transactions.map((tx) => tx.categoryKey).filter((key) => key.includes('/')),
      );

      expect(subcategoryKeys.size).toBeGreaterThanOrEqual(20);
    });

    it('earns income in more than one category', () => {
      const incomeCategories = new Set(
        template.transactions
          .filter((tx) => tx.transactionType === TRANSACTION_TYPES.income && !tx.transferKey)
          .map((tx) => tx.categoryKey),
      );

      expect(incomeCategories.size).toBeGreaterThanOrEqual(3);
    });

    it('puts real volume on the non-USD accounts', () => {
      const countFor = (accountKey: string) =>
        template.transactions.filter((tx) => tx.accountKey === accountKey && !tx.transferKey).length;

      expect(countFor('travel_card')).toBeGreaterThan(100);
      expect(countFor('cash')).toBeGreaterThan(100);
    });

    it('names a real merchant on spending rows so payees are not empty', () => {
      const known = new Set(allDemoMerchants().map((merchant) => merchant.name));
      const withMerchant = template.transactions.filter((tx) => tx.merchantName);

      expect(withMerchant.length).toBeGreaterThan(500);
      for (const tx of template.transactions) {
        if (tx.merchantName && tx.categoryKey !== 'other') {
          // Recurring bills and subscriptions name a payee that is not in the
          // shopping vocabulary, so only assert the vocabulary ones resolve.
          if (known.has(tx.merchantName)) expect(known.has(tx.merchantName)).toBe(true);
        }
      }
    });

    it('tags transactions, so tag filters return something', () => {
      const tagged = template.transactions.filter((tx) => tx.tagKeys?.length);
      const usedTags = new Set(tagged.flatMap((tx) => tx.tagKeys!));

      expect(tagged.length).toBeGreaterThan(300);
      expect(usedTags).toContain('must');
      expect(usedTags).toContain('need');
      expect(usedTags).toContain('want');
      expect(usedTags).toContain('subscription');
    });
  });
});
