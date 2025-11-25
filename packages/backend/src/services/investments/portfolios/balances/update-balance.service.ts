import { NotFoundError } from '@js/errors';
import Currencies from '@models/Currencies.model';
import PortfolioBalances from '@models/investments/PortfolioBalances.model';
import Portfolios from '@models/investments/Portfolios.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { Big } from 'big.js';

interface UpdatePortfolioBalanceParams {
  userId: number;
  portfolioId: number;
  currencyCode: string;
  availableCashDelta?: string; // Amount to add/subtract from available cash
  totalCashDelta?: string; // Amount to add/subtract from total cash
  setAvailableCash?: string; // Set available cash to specific amount
  setTotalCash?: string; // Set total cash to specific amount
}

const updatePortfolioBalanceImpl = async ({
  userId,
  portfolioId,
  currencyCode,
  availableCashDelta,
  totalCashDelta,
  setAvailableCash,
  setTotalCash,
}: UpdatePortfolioBalanceParams) => {
  // Verify portfolio exists and user owns it
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
  });

  if (!portfolio) {
    throw new NotFoundError({ message: 'Portfolio not found' });
  }

  // Verify currency exists
  const currency = await Currencies.findByPk(currencyCode);
  if (!currency) {
    throw new NotFoundError({ message: 'Currency not found' });
  }

  // Find or create portfolio balance record
  let balance = await PortfolioBalances.findOne({
    where: { portfolioId, currencyCode },
  });

  if (!balance) {
    // Create new balance record with zero values
    balance = await PortfolioBalances.create({
      portfolioId,
      currencyCode,
      availableCash: '0',
      totalCash: '0',
      refAvailableCash: '0',
      refTotalCash: '0',
    });
  }

  // Calculate new values
  let newAvailableCash: string;
  let newTotalCash: string;

  if (setAvailableCash !== undefined) {
    newAvailableCash = setAvailableCash;
  } else if (availableCashDelta !== undefined) {
    newAvailableCash = new Big(balance.availableCash).plus(new Big(availableCashDelta)).toFixed(10);
  } else {
    newAvailableCash = balance.availableCash;
  }

  if (setTotalCash !== undefined) {
    newTotalCash = setTotalCash;
  } else if (totalCashDelta !== undefined) {
    newTotalCash = new Big(balance.totalCash).plus(new Big(totalCashDelta)).toFixed(10);
  } else {
    newTotalCash = balance.totalCash;
  }

  // Calculate reference amounts (converted to user's base currency)
  const refAvailableCash = await calculateRefAmount({
    amount: parseFloat(newAvailableCash),
    baseCode: currency.code,
    userId,
    date: new Date(),
  });

  const refTotalCash = await calculateRefAmount({
    amount: parseFloat(newTotalCash),
    baseCode: currency.code,
    userId,
    date: new Date(),
  });

  // Update the balance
  await balance.update({
    availableCash: newAvailableCash,
    totalCash: newTotalCash,
    refAvailableCash,
    refTotalCash,
  });

  return balance.reload({
    include: [{ model: Currencies, as: 'currency' }],
  });
};

export const updatePortfolioBalance = withTransaction(updatePortfolioBalanceImpl);
