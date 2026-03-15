import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common/with-transaction';

import { getHoldingValues } from './get-holding-values.service';

const getHoldingsImpl = async ({
  userId,
  portfolioId,
  securityId,
  date,
}: {
  userId: number;
  portfolioId?: number;
  securityId?: number;
  date?: Date;
}) => {
  if (!portfolioId) {
    throw new NotFoundError({ message: t({ key: 'investments.portfolioIdRequired' }) });
  }

  const portfolio = await Portfolios.findOne({ where: { id: portfolioId, userId } });
  if (!portfolio) {
    throw new NotFoundError({ message: t({ key: 'investments.portfolioNotFound' }) });
  }

  // Get holdings with calculated market values
  const holdingValues = await getHoldingValues({ portfolioId, date, userId });

  // Filter by securityId if provided
  if (securityId) {
    return holdingValues.filter((h) => h.securityId === securityId);
  }

  return holdingValues;
};

export const getHoldings = withTransaction(getHoldingsImpl);
