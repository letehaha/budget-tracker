import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { Big } from 'big.js';

/**
 * Calculates the cash balance delta for a given investment transaction.
 *
 * Deltas are expressed in the transaction's settlement currency:
 * `settlementAmount` is the absolute cash that crossed the brokerage account
 * (buy/fee/tax — paid including fee; sell/dividend — received net of fee),
 * so the delta is just that value with the cash-flow sign applied.
 *
 * Returns null if the category has no cash impact.
 */
export function calculateCashDelta({
  category,
  settlementAmount,
}: {
  category: INVESTMENT_TRANSACTION_CATEGORY;
  settlementAmount: string;
}): string | null {
  const cashMoved = new Big(settlementAmount || '0');

  switch (category) {
    case INVESTMENT_TRANSACTION_CATEGORY.buy:
    case INVESTMENT_TRANSACTION_CATEGORY.fee:
    case INVESTMENT_TRANSACTION_CATEGORY.tax:
      return cashMoved.times(-1).toFixed(10);

    case INVESTMENT_TRANSACTION_CATEGORY.sell:
    case INVESTMENT_TRANSACTION_CATEGORY.dividend:
      return cashMoved.toFixed(10);

    case INVESTMENT_TRANSACTION_CATEGORY.transfer:
    case INVESTMENT_TRANSACTION_CATEGORY.cancel:
    case INVESTMENT_TRANSACTION_CATEGORY.other:
      return null;

    default: {
      // Exhaustiveness guard: breaks the build if the enum gains a member, and
      // fails loudly at runtime instead of silently returning `undefined`.
      const exhaustiveCheck: never = category;
      throw new Error(`Unhandled investment transaction category in calculateCashDelta: ${exhaustiveCheck}`);
    }
  }
}
