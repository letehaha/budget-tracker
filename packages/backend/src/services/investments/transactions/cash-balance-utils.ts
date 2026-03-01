import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { Big } from 'big.js';

/**
 * Calculates the cash balance delta for a given investment transaction.
 *
 * In the DB, `amount = quantity * price + fees` for all categories.
 *
 * Cash flow logic:
 *   BUY:      you pay qty*price for shares + fees to broker  → delta = -(qty*price + fees)
 *   SELL:     you receive qty*price for shares - fees         → delta = +(qty*price - fees)
 *   DIVIDEND: you receive qty*price (gross) - fees (tax/comm) → delta = +(qty*price - fees)
 *   FEE:      standalone fee (qty*price = fee, fees=0 typically) → delta = -amount
 *   TAX:      standalone tax (same pattern as fee)            → delta = -amount
 *   TRANSFER/CANCEL/OTHER: no cash impact
 *
 * Returns null if the category has no cash impact.
 */
export function calculateCashDelta({
  category,
  quantity,
  price,
  fees,
  amount,
}: {
  category: INVESTMENT_TRANSACTION_CATEGORY;
  quantity: string;
  price: string;
  fees: string;
  amount: string;
}): string | null {
  const bigQty = new Big(quantity || '0');
  const bigPrice = new Big(price || '0');
  const bigFees = new Big(fees || '0');
  const bigAmount = new Big(amount || '0');

  switch (category) {
    case INVESTMENT_TRANSACTION_CATEGORY.buy:
      return bigQty.times(bigPrice).plus(bigFees).times(-1).toFixed(10);

    case INVESTMENT_TRANSACTION_CATEGORY.sell:
    case INVESTMENT_TRANSACTION_CATEGORY.dividend:
      return bigQty.times(bigPrice).minus(bigFees).toFixed(10);

    case INVESTMENT_TRANSACTION_CATEGORY.fee:
    case INVESTMENT_TRANSACTION_CATEGORY.tax:
      return bigAmount.times(-1).toFixed(10);

    case INVESTMENT_TRANSACTION_CATEGORY.transfer:
    case INVESTMENT_TRANSACTION_CATEGORY.cancel:
    case INVESTMENT_TRANSACTION_CATEGORY.other:
      return null;
  }
}
