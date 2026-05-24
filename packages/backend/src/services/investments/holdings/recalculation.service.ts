import { ASSET_CLASS, INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Holdings from '@models/investments/holdings.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Securities from '@models/investments/securities.model';
import { withTransaction } from '@services/common/with-transaction';
import { Big } from 'big.js';

const recalculateHoldingImpl = async (holdingId: { portfolioId: string; securityId: string }) => {
  const holding = await findOrThrowNotFound({
    query: Holdings.findOne({
      where: holdingId,
      include: [{ model: Securities, as: 'security', required: true }],
    }),
    message: t({ key: 'investments.holdingNotFoundForRecalculation' }),
  });

  const transactions = await InvestmentTransaction.findAll({
    where: {
      portfolioId: holding.portfolioId,
      securityId: holding.securityId,
    },
    order: [['date', 'ASC']],
  });

  let totalQuantity = new Big(0);
  let totalCostBasis = new Big(0);
  let totalRefCostBasis = new Big(0);

  for (const tx of transactions) {
    const quantity = tx.quantity.toBig();
    const amount = tx.amount.toBig();
    const refAmount = tx.refAmount.toBig();

    // Invariant: cost basis represents the cost of the *current long position*.
    // While running quantity is ≤ 0 (allowed for crypto drift), there is no
    // long position, so cost basis must stay zero. Otherwise, average-cost
    // tracking on the long portion. Without this invariant, the previous code
    // silently inflated cost basis: a SELL while qty was negative produced a
    // negative `quantity / totalQuantity` proportion and *added* to cost
    // instead of reducing it (seen as a $1.27M cost basis on 0.28 BTC after a
    // realistic Yahoo CSV import).
    switch (tx.category) {
      case INVESTMENT_TRANSACTION_CATEGORY.buy: {
        const newQuantity = totalQuantity.plus(quantity);
        if (newQuantity.lte(0)) {
          // Buy that doesn't bring the position out of short — no long position
          // to attribute cost to.
          totalCostBasis = new Big(0);
          totalRefCostBasis = new Big(0);
        } else if (totalQuantity.lte(0)) {
          // Buy crosses from short/zero into a long position. Only the portion
          // above zero counts as a new long basis; the rest just covered the short.
          const longProportion = newQuantity.div(quantity);
          totalCostBasis = amount.times(longProportion);
          totalRefCostBasis = refAmount.times(longProportion);
        } else {
          totalCostBasis = totalCostBasis.plus(amount);
          totalRefCostBasis = totalRefCostBasis.plus(refAmount);
        }
        totalQuantity = newQuantity;
        break;
      }

      case INVESTMENT_TRANSACTION_CATEGORY.sell: {
        if (totalQuantity.gt(0)) {
          const newQuantity = totalQuantity.minus(quantity);
          if (newQuantity.lte(0)) {
            totalCostBasis = new Big(0);
            totalRefCostBasis = new Big(0);
          } else {
            const remainingProportion = newQuantity.div(totalQuantity);
            totalCostBasis = totalCostBasis.times(remainingProportion);
            totalRefCostBasis = totalRefCostBasis.times(remainingProportion);
          }
        }
        // Sell from zero/short position doesn't touch cost basis.
        totalQuantity = totalQuantity.minus(quantity);
        break;
      }

      case INVESTMENT_TRANSACTION_CATEGORY.dividend:
      case INVESTMENT_TRANSACTION_CATEGORY.fee:
        // These do not affect quantity or cost basis in this model
        break;
    }
  }

  // Crypto holdings may legitimately go negative (staking/fee drift) until the
  // user reconciles via a "mark as zero" adjustment; stocks always cap at zero.
  const allowNegativeQuantity = holding.security?.assetClass === ASSET_CLASS.crypto;
  holding.quantity = Money.fromDecimal(!allowNegativeQuantity && totalQuantity.lt(0) ? '0' : totalQuantity.toFixed(10));
  holding.costBasis = Money.fromDecimal(totalCostBasis.lt(0) ? '0' : totalCostBasis.toFixed(10));
  holding.refCostBasis = Money.fromDecimal(totalRefCostBasis.lt(0) ? '0' : totalRefCostBasis.toFixed(10));
  await holding.save();

  return holding;
};

export const recalculateHolding = withTransaction(recalculateHoldingImpl);
