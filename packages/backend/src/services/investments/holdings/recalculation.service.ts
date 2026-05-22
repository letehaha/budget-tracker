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

    switch (tx.category) {
      case INVESTMENT_TRANSACTION_CATEGORY.buy:
        totalQuantity = totalQuantity.plus(quantity);
        totalCostBasis = totalCostBasis.plus(amount);
        totalRefCostBasis = totalRefCostBasis.plus(refAmount);
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
