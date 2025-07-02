import { NotFoundError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import Holdings from '@models/investments/Holdings.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import { withTransaction } from '@services/common';

const getHoldingsImpl = async ({
  userId,
  portfolioId,
  securityId,
}: {
  userId: number;
  portfolioId?: number;
  securityId?: number;
}) => {
  const portfolio = await Portfolios.findOne({ where: { id: portfolioId, userId } });
  if (!portfolio) {
    throw new NotFoundError({ message: 'Portfolio not found.' });
  }

  return Holdings.findAll({
    where: removeUndefinedKeys({ portfolioId, securityId }),
    include: [Securities], // Include security details with each holding
    order: [[{ model: Securities, as: 'security' }, 'symbol', 'ASC']],
  });
};

export const getHoldings = withTransaction(getHoldingsImpl);
