import { ConflictError, NotFoundError } from '@js/errors';
import { logger } from '@js/utils';
import { getCurrency } from '@models/Currencies.model';
import Holdings from '@models/investments/Holdings.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import { withTransaction } from '@services/common';
import { addUserCurrencies } from '@services/currencies/add-user-currency';
import { syncHistoricalPrices } from '@services/investments/securities-price/historical-sync.service';

interface CreateHoldingParams {
  userId: number;
  portfolioId: number;
  securityId: number;
}

const createHoldingImpl = async ({ userId, portfolioId, securityId }: CreateHoldingParams) => {
  const portfolio = await Portfolios.findOne({ where: { id: portfolioId, userId } });
  if (!portfolio) {
    throw new NotFoundError({ message: 'Portfolio not found.' });
  }

  const security = await Securities.findByPk(securityId);
  if (!security) {
    throw new NotFoundError({ message: 'Security not found.' });
  }

  // Ensure user has the currency for this security
  const currency = await getCurrency({ code: security.currencyCode.toUpperCase() });
  if (!currency) {
    throw new NotFoundError({ message: 'Currency for security not found.' });
  }
  await addUserCurrencies([{ userId, currencyId: currency.id }]);

  const existingHolding = await Holdings.findOne({ where: { portfolioId, securityId } });
  if (existingHolding) {
    throw new ConflictError({ message: 'This security is already in the portfolio.' });
  }

  const newHolding = await Holdings.create({
    portfolioId,
    securityId,
    currencyCode: security.currencyCode,
    quantity: '0',
    costBasis: '0',
    refCostBasis: '0',
    value: '0', // Deprecated - will be removed
    refValue: '0', // Deprecated - will be removed
  });

  return { newHolding, securityId };
};

export const createHolding = async (params: CreateHoldingParams) => {
  const { newHolding, securityId } = await withTransaction(createHoldingImpl)(params);

  // Trigger background price sync after transaction is committed
  syncHistoricalPrices(securityId).catch((error) => {
    logger.error({
      message: `Background historical price sync failed for securityId: ${securityId}`,
      error: error as Error,
    });
  });

  return newHolding;
};
