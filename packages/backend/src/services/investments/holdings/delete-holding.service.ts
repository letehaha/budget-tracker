import { t } from '@i18n/index';
import { NotAllowedError, NotFoundError } from '@js/errors';
import Holdings from '@models/investments/Holdings.model';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteParams {
  userId: number;
  portfolioId: number;
  securityId: number;
}

const deleteHoldingImpl = async ({ userId, portfolioId, securityId }: DeleteParams) => {
  const portfolio = await Portfolios.findOne({ where: { id: portfolioId, userId } });
  if (!portfolio) {
    throw new NotFoundError({ message: t({ key: 'investments.portfolioNotFound' }) });
  }

  const holding = await Holdings.findOne({
    where: { portfolioId, securityId },
  });

  if (!holding) return;

  // Business Rule: Prevent deletion if there's an active position.
  // The user must sell or transfer all shares first.
  // TODO: improve this logic and let user delete even active positions. We just
  // need to confirm that user wants this, and if so - remove holding with(out) all transactions?
  if (!holding.quantity.isZero()) {
    throw new NotAllowedError({
      message: t({ key: 'investments.cannotDeleteHoldingWithActivePosition' }),
    });
  }

  await holding.destroy();
};

export const deleteHolding = withTransaction(deleteHoldingImpl);
