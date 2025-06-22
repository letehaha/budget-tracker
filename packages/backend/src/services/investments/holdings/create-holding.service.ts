import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { ConflictError, NotAllowedError, NotFoundError } from '@js/errors';
import { logger } from '@js/utils';
import Accounts from '@models/Accounts.model';
import { getCurrency } from '@models/Currencies.model';
import Holdings from '@models/investments/Holdings.model';
import Securities from '@models/investments/Securities.model';
import { withTransaction } from '@services/common';
import { addUserCurrencies } from '@services/currencies/add-user-currency';
import { syncHistoricalPrices } from '@services/investments/securities-price/historical-sync.service';

interface CreateHoldingParams {
  userId: number;
  accountId: number;
  securityId: number;
}

const createHoldingImpl = async ({ userId, accountId, securityId }: CreateHoldingParams) => {
  const account = await Accounts.findOne({ where: { id: accountId, userId } });
  if (!account) {
    throw new NotFoundError({ message: 'Account not found.' });
  }

  if (account.accountCategory !== ACCOUNT_CATEGORIES.investment) {
    throw new NotAllowedError({ message: 'Holdings can only be added to investment accounts.' });
  }

  const security = await Securities.findByPk(securityId);
  if (!security) {
    throw new NotFoundError({ message: 'Security not found.' });
  }

  // Ensure user has the currency for this security
  const currency = await getCurrency({ code: security.currencyCode });
  if (!currency) {
    throw new NotFoundError({ message: 'Currency for security not found.' });
  }
  await addUserCurrencies([{ userId, currencyId: currency.id }]);

  const existingHolding = await Holdings.findOne({ where: { accountId, securityId } });
  if (existingHolding) {
    throw new ConflictError({ message: 'This security is already in the account.' });
  }

  const newHolding = await Holdings.create({
    accountId,
    securityId,
    currencyCode: security.currencyCode,
    quantity: '0',
    costBasis: '0',
    refCostBasis: '0',
    value: '0',
    refValue: '0',
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
