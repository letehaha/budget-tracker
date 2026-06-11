import { INVESTMENT_DECIMAL_SCALE } from '@common/types/money';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';
import { recalculateHolding } from '@services/investments/holdings/recalculation.service';
import { updatePortfolioBalance } from '@services/investments/portfolios/balances';
import { ensureUserCurrencyConnected } from '@services/sharing/auth/ensure-currency-connected.service';
import { Big } from 'big.js';

import { calculateCashDelta } from './cash-balance-utils';

interface DeleteTransactionParams {
  userId: number;
  transactionId: string;
}

const deleteInvestmentTransactionImpl = async ({ userId, transactionId }: DeleteTransactionParams) => {
  const transaction = await InvestmentTransaction.findOne({
    where: { id: transactionId },
    include: [{ model: Portfolios, as: 'portfolio', where: { userId }, required: true }],
  });

  if (!transaction) {
    return { success: true };
  }

  const { portfolioId, securityId, category, settlementCurrencyCode } = transaction;
  const settlementAmount = transaction.settlementAmount.toDecimalString(INVESTMENT_DECIMAL_SCALE);

  await transaction.destroy();
  await recalculateHolding({ portfolioId, securityId });

  const cashDelta = calculateCashDelta({ category, settlementAmount });

  if (cashDelta !== null) {
    const reversedDelta = new Big(cashDelta).times(-1).toFixed(10);
    // The settlement currency may have been disconnected from the user since
    // creation; idempotently re-link it so updatePortfolioBalance's ref-amount
    // lookup doesn't fail with `currencyNotConnected`.
    await ensureUserCurrencyConnected({ userId, currencyCode: settlementCurrencyCode });
    await updatePortfolioBalance({
      userId,
      portfolioId,
      currencyCode: settlementCurrencyCode,
      availableCashDelta: reversedDelta,
      totalCashDelta: reversedDelta,
    });
  }

  return { success: true };
};

export const deleteInvestmentTransaction = withTransaction(deleteInvestmentTransactionImpl);
