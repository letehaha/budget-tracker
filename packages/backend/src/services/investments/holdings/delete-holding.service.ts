import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotAllowedError } from '@js/errors';
import Holdings from '@models/investments/holdings.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteParams {
  userId: number;
  portfolioId: string;
  securityId: string;
  /**
   * When true, also deletes every InvestmentTransaction for this
   * (portfolioId, securityId) and bypasses the non-zero quantity guard.
   * Used by the holdings table trash action after the user confirms.
   */
  force?: boolean;
}

const deleteHoldingImpl = async ({ userId, portfolioId, securityId, force = false }: DeleteParams) => {
  await findOrThrowNotFound({
    query: Portfolios.findOne({ where: { id: portfolioId, userId } }),
    message: t({ key: 'investments.portfolioNotFound' }),
  });

  const holding = await Holdings.findOne({
    where: { portfolioId, securityId },
  });

  if (!holding) return;

  if (force) {
    await InvestmentTransaction.destroy({ where: { portfolioId, securityId } });
    await holding.destroy();
    return;
  }

  // Default: refuse to delete an active position. The UI uses `force` after a
  // confirm dialog so the user explicitly opts into transaction cleanup.
  if (!holding.quantity.isZero()) {
    throw new NotAllowedError({
      message: t({ key: 'investments.cannotDeleteHoldingWithActivePosition' }),
    });
  }

  await holding.destroy();
};

export const deleteHolding = withTransaction(deleteHoldingImpl);
