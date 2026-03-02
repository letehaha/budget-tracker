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

interface DirectCashTransactionParams {
  userId: number;
  portfolioId: number;
  type: 'deposit' | 'withdrawal';
  amount: string;
  currencyCode: string;
  date: string;
  description?: string | null;
}

const directCashTransactionImpl = async ({
  userId,
  portfolioId,
  type,
  amount,
  currencyCode,
  date,
  description,
}: DirectCashTransactionParams) => {
  validatePositiveAmount({ amount });

  await findPortfolioOrThrow({ portfolioId, userId, role: 'generic' });
  await findCurrencyOrThrow({ currencyCode });

  const refAmount = await computeRefAmount({ amount, currencyCode, userId, date });

  // Determine which portfolio FK to set based on type
  const isDeposit = type === 'deposit';

  // Create PortfolioTransfer record — no linked transaction (pure cash operation)
  const transfer = await PortfolioTransfers.create({
    userId,
    fromAccountId: null,
    toAccountId: null,
    fromPortfolioId: isDeposit ? null : portfolioId,
    toPortfolioId: isDeposit ? portfolioId : null,
    amount,
    refAmount,
    currencyCode,
    date,
    description,
  });

  // Update portfolio cash balance
  const delta = isDeposit ? amount : new Big(amount).times(-1).toFixed(10);
  await updatePortfolioBalance({
    userId,
    portfolioId,
    currencyCode,
    availableCashDelta: delta,
    totalCashDelta: delta,
  });

  return transfer.reload({
    include: [
      { model: Portfolios, as: 'toPortfolio' },
      { model: Portfolios, as: 'fromPortfolio' },
      { model: Currencies, as: 'currency' },
    ],
  });
};

export const directCashTransaction = withTransaction(directCashTransactionImpl);
