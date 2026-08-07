import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Currencies from '@models/currencies.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';

interface SetTransferAdjustmentParams {
  userId: number;
  transferId: string;
  isAdjustment: boolean;
}

/**
 * Flips whether a transfer counts as a contribution, and nothing else.
 *
 * Amount, date and currency stay untouched on purpose: the money already moved
 * and the portfolio balance already reflects it, so there is no balance to
 * reverse and no reference amount to recompute. Re-classifying is therefore safe
 * on any transfer, including one with a linked account transaction.
 */
const setTransferAdjustmentImpl = async ({ userId, transferId, isAdjustment }: SetTransferAdjustmentParams) => {
  const transfer = await findOrThrowNotFound({
    query: PortfolioTransfers.findOne({ where: { id: transferId, userId } }),
    message: t({ key: 'investments.portfolioTransferNotFound' }),
  });

  await transfer.update({ isAdjustment });

  return transfer.reload({
    include: [
      { model: Portfolios, as: 'toPortfolio' },
      { model: Portfolios, as: 'fromPortfolio' },
      { model: Currencies, as: 'currency' },
    ],
  });
};

export const setTransferAdjustment = withTransaction(setTransferAdjustmentImpl);
