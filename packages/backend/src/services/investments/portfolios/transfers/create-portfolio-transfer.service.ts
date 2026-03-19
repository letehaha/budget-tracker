import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Currencies from '@models/currencies.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';
import { updatePortfolioBalance } from '@services/investments/portfolios/balances';

import {
  computeRefAmount,
  findCurrencyOrThrow,
  findPortfolioOrThrow,
  negateAmount,
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
  const negated = negateAmount({ amount });
  await updatePortfolioBalance({
    userId,
    portfolioId: fromPortfolioId,
    currencyCode,
    availableCashDelta: negated,
    totalCashDelta: negated,
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
