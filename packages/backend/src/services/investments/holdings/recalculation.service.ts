import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { NotFoundError } from '@js/errors';
import Holdings from '@models/investments/Holdings.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import { withTransaction } from '@services/common';
import { Big } from 'big.js';

const recalculateHoldingImpl = async (holdingId: { accountId: number; securityId: number }) => {
  const holding = await Holdings.findOne({ where: holdingId });
  if (!holding) {
    throw new NotFoundError({ message: 'Holding not found for recalculation.' });
  }

  const transactions = await InvestmentTransaction.findAll({
    where: {
      accountId: holding.accountId,
      securityId: holding.securityId,
    },
    order: [['date', 'ASC']],
  });

  let totalQuantity = new Big(0);
  let totalCostBasis = new Big(0);
  let totalRefCostBasis = new Big(0);

  for (const tx of transactions) {
    const quantity = new Big(tx.quantity);
    const amount = new Big(tx.amount);
    const fees = new Big(tx.fees);
    const refAmount = new Big(tx.refAmount);
    const refFees = new Big(tx.refFees);

    switch (tx.category) {
      case INVESTMENT_TRANSACTION_CATEGORY.buy:
        totalQuantity = totalQuantity.plus(quantity);
        totalCostBasis = totalCostBasis.plus(amount).plus(fees);
        totalRefCostBasis = totalRefCostBasis.plus(refAmount).plus(refFees);
        break;

      case INVESTMENT_TRANSACTION_CATEGORY.sell: {
        let costBasisReduction = new Big(0);
        let refCostBasisReduction = new Big(0);

        // Only calculate proportional reduction if there's a position to sell from.
        // If selling from a zero-quantity position, the cost basis reduction is zero.
        if (!totalQuantity.eq(0)) {
          const proportion = quantity.div(totalQuantity);
          costBasisReduction = totalCostBasis.times(proportion);
          refCostBasisReduction = totalRefCostBasis.times(proportion);
        }

        totalCostBasis = totalCostBasis.minus(costBasisReduction);
        totalRefCostBasis = totalRefCostBasis.minus(refCostBasisReduction);
        totalQuantity = totalQuantity.minus(quantity);
        break;
      }

      case INVESTMENT_TRANSACTION_CATEGORY.dividend:
      case INVESTMENT_TRANSACTION_CATEGORY.fee:
        // These do not affect quantity or cost basis in this model
        break;
    }
  }

  holding.quantity = totalQuantity.toFixed(10);
  holding.costBasis = totalCostBasis.toFixed(10);
  holding.refCostBasis = totalRefCostBasis.toFixed(10);
  await holding.save();

  return holding;
};

export const recalculateHolding = withTransaction(recalculateHoldingImpl);
