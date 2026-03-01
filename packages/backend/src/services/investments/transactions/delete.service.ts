import { INVESTMENT_DECIMAL_SCALE } from '@common/types/money';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common/with-transaction';
import { recalculateHolding } from '@services/investments/holdings/recalculation.service';
import { updatePortfolioBalance } from '@services/investments/portfolios/balances';
import { Big } from 'big.js';

import { calculateCashDelta } from './cash-balance-utils';

interface DeleteTransactionParams {
  userId: number;
  transactionId: number;
}

const deleteInvestmentTransactionImpl = async ({ userId, transactionId }: DeleteTransactionParams) => {
  // Find the transaction and verify ownership through portfolio
  const transaction = await InvestmentTransaction.findOne({
    where: { id: transactionId },
    include: [{ model: Portfolios, as: 'portfolio', where: { userId }, required: true }],
  });

  if (!transaction) {
    return { success: true };
  }

  // Store fields needed for recalculation and cash reversal before deletion
  const { portfolioId, securityId, category, currencyCode } = transaction;
  const quantity = transaction.quantity.toDecimalString(18);
  const price = transaction.price.toDecimalString(INVESTMENT_DECIMAL_SCALE);
  const fees = transaction.fees.toDecimalString(INVESTMENT_DECIMAL_SCALE);
  const amount = transaction.amount.toDecimalString(INVESTMENT_DECIMAL_SCALE);

  // Delete the transaction
  await transaction.destroy();

  // After deleting the transaction, trigger a full recalculation of the holding
  await recalculateHolding({ portfolioId, securityId });

  // Reverse the cash balance impact
  const cashDelta = calculateCashDelta({ category, quantity, price, fees, amount });

  if (cashDelta !== null) {
    // Reverse: negate the original delta
    const reversedDelta = new Big(cashDelta).times(-1).toFixed(10);
    await updatePortfolioBalance({
      userId,
      portfolioId,
      currencyCode,
      availableCashDelta: reversedDelta,
      totalCashDelta: reversedDelta,
    });
  }

  return { success: true };
};

export const deleteInvestmentTransaction = withTransaction(deleteInvestmentTransactionImpl);
