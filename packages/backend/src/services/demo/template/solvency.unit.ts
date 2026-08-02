import { TRANSACTION_TYPES } from '@bt/shared/types';

import { DEMO_CONFIG, type DemoAccountKey } from '../demo-config';
import { toBaseCurrencyCents } from './fx';
import { generateDemoTemplate } from './generate';

/**
 * The demo persona has to stay solvent.
 *
 * The generator emits income, spending, and transfers independently, so a rate
 * change elsewhere can push an account negative or balloon one into a number
 * nobody would believe. Replaying balances here catches that at build time,
 * not on a visitor's dashboard.
 *
 * Each anchor is a different day of the month, because the history window's
 * edges cut the first and last months at whatever day the template is built on.
 * A cut that keeps a month's bills but drops its payday overdraws checking.
 */
describe('demo persona solvency', () => {
  /** Base-currency cents that the investment seeder pulls out of savings. */
  const PORTFOLIO_CONTRIBUTIONS_CENTS = 2648500;

  const ANCHORS = [
    '2026-08-01T00:00:00Z',
    '2026-08-02T09:00:00Z',
    '2026-08-05T23:59:00Z',
    '2026-03-01T12:00:00Z',
    '2026-12-31T18:00:00Z',
  ];

  const initialByKey = new Map<DemoAccountKey, number>(
    DEMO_CONFIG.accounts.map((account) => [account.key, account.initialBalance]),
  );
  const currencyByKey = new Map<DemoAccountKey, string>(
    DEMO_CONFIG.accounts.map((account) => [account.key, account.currency]),
  );

  /** Running balance per account, oldest to newest, in the account's own currency. */
  const replay = (generatedAt: Date) => {
    const template = generateDemoTemplate({ generatedAt });
    const ordered = template.transactions.toSorted((a, b) => b.dayOffset - a.dayOffset);
    const balances = new Map(initialByKey);
    const lowest = new Map(initialByKey);

    for (const tx of ordered) {
      const current = balances.get(tx.accountKey);
      if (current === undefined) continue;

      const next = tx.transactionType === TRANSACTION_TYPES.income ? current + tx.amount : current - tx.amount;
      balances.set(tx.accountKey, next);
      lowest.set(tx.accountKey, Math.min(lowest.get(tx.accountKey) ?? next, next));
    }

    return { balances, lowest };
  };

  const inBaseCents = ({ accountKey, amount }: { accountKey: DemoAccountKey; amount: number }) => {
    const currencyCode = currencyByKey.get(accountKey)!;

    return toBaseCurrencyCents({
      amount,
      currencyCode,
      dayOffset: 0,
      spotRate: DEMO_CONFIG.exchangeRates[currencyCode],
    });
  };

  describe.each(ANCHORS)('generated at %s', (anchor) => {
    const { balances, lowest } = replay(new Date(anchor));

    it('never overdraws the checking account', () => {
      expect(lowest.get('main_checking')).toBeGreaterThan(0);
    });

    it('leaves savings able to fund the portfolio contributions', () => {
      // The investment seeder funds itself from savings, against the same
      // balance this replay computes.
      expect(balances.get('savings')! - PORTFOLIO_CONTRIBUTIONS_CENTS).toBeGreaterThan(0);
    });

    it('keeps the travel card inside its credit limit', () => {
      const creditLimit = DEMO_CONFIG.accounts.find((account) => account.key === 'travel_card')!.creditLimit;

      // A credit card carries a negative balance when money is owed.
      expect(Math.abs(Math.min(0, lowest.get('travel_card')!))).toBeLessThan(creditLimit);
    });

    it('keeps the cash account non-negative', () => {
      expect(lowest.get('cash')).toBeGreaterThanOrEqual(0);
    });

    it('lands every account on a believable closing balance', () => {
      const checking = inBaseCents({ accountKey: 'main_checking', amount: balances.get('main_checking')! });
      const savings =
        inBaseCents({ accountKey: 'savings', amount: balances.get('savings')! }) - PORTFOLIO_CONTRIBUTIONS_CENTS;

      // Wide bands catch an order-of-magnitude mistake while tolerating ordinary
      // drift as the generator's rates get tuned.
      expect(checking).toBeGreaterThan(100_000);
      expect(checking).toBeLessThan(6_000_000);
      expect(savings).toBeGreaterThan(500_000);
      expect(savings).toBeLessThan(12_000_000);
    });
  });
});
