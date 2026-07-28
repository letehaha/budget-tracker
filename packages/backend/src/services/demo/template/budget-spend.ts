import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';

import { DEMO_CONFIG, type DemoAccountKey } from '../demo-config';
import { toBaseCurrencyCents } from './fx';
import type { DemoTemplate, DemoTemplateTransaction } from './types';

/** What one template row contributed to one category key, in base-currency cents. */
interface SpendContribution {
  categoryKey: string;
  amount: number;
}

/**
 * Base-currency spend per category key over the demo's budget window.
 *
 * Matches `services/budgets/stats.ts`: a transaction with splits is skipped and
 * its split rows counted instead, and refund pairs are netted out the same way
 * its `applyRefundAdjustments` does, so a limit derived here lands the budget
 * card on the intended utilization.
 *
 * Kept in memory instead of queried back: a visitor is waiting on the landing
 * page, and the rows this reads were inserted a moment earlier.
 */
export function sumSpendByCategoryKey({
  template,
  windowDays,
  currencyByAccountKey,
}: {
  template: DemoTemplate;
  /** How many days back from the demo's reference date the window reaches. */
  windowDays: number;
  currencyByAccountKey: Partial<Record<DemoAccountKey, string>>;
}): Map<string, number> {
  const splitRefs = new Set(template.splits.map((split) => split.transactionRef));
  const transactionByRef = new Map(template.transactions.filter((tx) => tx.ref).map((tx) => [tx.ref!, tx] as const));

  const spend = new Map<string, number>();
  const contributionsByRef = new Map<string, SpendContribution[]>();

  // Budget stats compare `refAmount`, so euro and zloty spending has to be
  // converted here too. Summing raw amounts would count a zloty as a dollar and
  // inflate every limit drawn from a category those accounts touch.
  const toBase = ({ tx, amount }: { tx: DemoTemplateTransaction; amount: number }) => {
    const currencyCode = currencyByAccountKey[tx.accountKey] ?? DEMO_CONFIG.baseCurrency;
    return toBaseCurrencyCents({
      amount,
      currencyCode,
      dayOffset: tx.dayOffset,
      spotRate: DEMO_CONFIG.exchangeRates[currencyCode],
    });
  };

  const add = ({ categoryKey, amount }: SpendContribution) => {
    spend.set(categoryKey, (spend.get(categoryKey) ?? 0) + amount);
  };

  const contribute = ({ ref, categoryKey, amount }: SpendContribution & { ref?: string }) => {
    add({ categoryKey, amount });
    if (!ref) return;
    contributionsByRef.set(ref, [...(contributionsByRef.get(ref) ?? []), { categoryKey, amount }]);
  };

  const inWindowByRef = new Map<string, DemoTemplateTransaction>();

  for (const tx of template.transactions) {
    if (tx.dayOffset > windowDays) continue;
    if (tx.transactionType !== TRANSACTION_TYPES.expense) continue;
    if ((tx.transferNature ?? TRANSACTION_TRANSFER_NATURE.not_transfer) !== TRANSACTION_TRANSFER_NATURE.not_transfer) {
      continue;
    }

    if (tx.ref) inWindowByRef.set(tx.ref, tx);
    if (tx.ref && splitRefs.has(tx.ref)) continue;

    contribute({ ref: tx.ref, categoryKey: tx.categoryKey, amount: toBase({ tx, amount: tx.amount }) });
  }

  for (const split of template.splits) {
    const parent = inWindowByRef.get(split.transactionRef);
    if (!parent) continue;

    contribute({
      ref: split.transactionRef,
      categoryKey: split.categoryKey,
      amount: toBase({ tx: parent, amount: split.amount }),
    });
  }

  // A refund shouldn't eat budget, so it nets off the original's category (or
  // its splits pro rata) the same way stats does. The refund row is income and
  // never entered the sum, so its own date can sit outside the window.
  for (const pair of template.refunds) {
    const contributions = contributionsByRef.get(pair.originalRef);
    const refundTx = transactionByRef.get(pair.refundRef);
    if (!contributions || !refundTx) continue;

    const counted = contributions.reduce((total, contribution) => total + contribution.amount, 0);
    if (counted <= 0) continue;

    const refunded = toBase({ tx: refundTx, amount: refundTx.amount });
    for (const contribution of contributions) {
      add({ categoryKey: contribution.categoryKey, amount: -Math.round((refunded * contribution.amount) / counted) });
    }
  }

  return spend;
}
