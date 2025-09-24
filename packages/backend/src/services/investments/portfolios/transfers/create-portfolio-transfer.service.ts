import { NotFoundError, ValidationError } from '@js/errors';
import Currencies from '@models/Currencies.model';
import PortfolioTransfers from '@models/investments/PortfolioTransfers.model';
import Portfolios from '@models/investments/Portfolios.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common';
import { updatePortfolioBalance } from '@services/investments/portfolios/balances';
import { Big } from 'big.js';

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
  // Validate input
  if (fromPortfolioId === toPortfolioId) {
    throw new ValidationError({ message: 'Source and destination portfolios must be different' });
  }

  if (new Big(amount).lte(0)) {
    throw new ValidationError({ message: 'Transfer amount must be greater than zero' });
  }

  // Verify source portfolio exists and user owns it
  const sourcePortfolio = await Portfolios.findOne({
    where: { id: fromPortfolioId, userId },
  });

  if (!sourcePortfolio) {
    throw new NotFoundError({ message: 'Source portfolio not found' });
  }

  // Verify destination portfolio exists and user owns it
  const destPortfolio = await Portfolios.findOne({
    where: { id: toPortfolioId, userId },
  });

  if (!destPortfolio) {
    throw new NotFoundError({ message: 'Destination portfolio not found' });
  }

  // Verify currency exists
  const currency = await Currencies.findByPk(currencyCode);
  if (!currency) {
    throw new NotFoundError({ message: 'Currency not found' });
  }

  // Calculate reference amount (converted to user's base currency)
  const refAmount = await calculateRefAmount({
    amount: parseFloat(amount),
    baseCode: currency.code,
    userId,
    date: new Date(date),
  });

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
