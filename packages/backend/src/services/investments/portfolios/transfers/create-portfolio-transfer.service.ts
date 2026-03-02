import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Currencies from '@models/Currencies.model';
import Portfolios from '@models/investments/Portfolios.model';
import PortfolioTransfers from '@models/investments/PortfolioTransfers.model';
import { withTransaction } from '@services/common/with-transaction';
import { updatePortfolioBalance } from '@services/investments/portfolios/balances';
import { Big } from 'big.js';

import {
  computeRefAmount,
  findCurrencyOrThrow,
  findPortfolioOrThrow,
  validatePositiveAmount,
} from './transfer-validations';

interface CreatePortfolioTransferParams {
  userId: number;
  fromPortfolioId: number;
  toPortfolioId: number;
  currencyCode: string;
  amount: string;
  date: string;
  description?: string | null;
}

const createPortfolioTransferImpl = async ({
  userId,
  fromPortfolioId,
  toPortfolioId,
  currencyCode,
  amount,
  date,
  description,
}: CreatePortfolioTransferParams) => {
  if (fromPortfolioId === toPortfolioId) {
    throw new ValidationError({ message: t({ key: 'investments.sourceAndDestinationMustDiffer' }) });
  }

  validatePositiveAmount({ amount });

  await findPortfolioOrThrow({ portfolioId: fromPortfolioId, userId, role: 'source' });
  await findPortfolioOrThrow({ portfolioId: toPortfolioId, userId, role: 'destination' });
  await findCurrencyOrThrow({ currencyCode });

  const refAmount = await computeRefAmount({ amount, currencyCode, userId, date });

  // Create the transfer record
  const transfer = await PortfolioTransfers.create({
    userId,
    fromPortfolioId,
    toPortfolioId,
    fromAccountId: null,
    toAccountId: null,
    amount,
    refAmount,
    currencyCode,
    date,
    description,
  });

  // Update portfolio balances
  // Subtract from source portfolio
  await updatePortfolioBalance({
    userId,
    portfolioId: fromPortfolioId,
    currencyCode,
    availableCashDelta: new Big(amount).times(-1).toFixed(10),
    totalCashDelta: new Big(amount).times(-1).toFixed(10),
  });

  // Add to destination portfolio
  await updatePortfolioBalance({
    userId,
    portfolioId: toPortfolioId,
    currencyCode,
    availableCashDelta: amount,
    totalCashDelta: amount,
  });

  return transfer.reload({
    include: [
      { model: Portfolios, as: 'fromPortfolio' },
      { model: Portfolios, as: 'toPortfolio' },
      { model: Currencies, as: 'currency' },
    ],
  });
};

export const createPortfolioTransfer = withTransaction(createPortfolioTransferImpl);
