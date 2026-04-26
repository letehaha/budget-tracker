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

interface DirectCashTransactionParams {
  userId: number;
  portfolioId: number;
  type: 'deposit' | 'withdrawal';
  amount: string;
  currencyCode: string;
  date: string;
  description?: string | null;
  // When true: record the cash-flow event for stats purposes (IRR, deposits/
  // withdrawals totals, portfolio age) but do NOT change the running cash
  // balance. Used to backfill flows that pre-date when the user started
  // tracking — e.g., a deposit that funded buys already in the system.
  isHistorical?: boolean;
}

const directCashTransactionImpl = async ({
  userId,
  portfolioId,
  type,
  amount,
  currencyCode,
  date,
  description,
  isHistorical = false,
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
    isHistorical,
  });

  if (!isHistorical) {
    const delta = isDeposit ? amount : negateAmount({ amount });
    await updatePortfolioBalance({
      userId,
      portfolioId,
      currencyCode,
      availableCashDelta: delta,
      totalCashDelta: delta,
    });
  }

  return transfer.reload({
    include: [
      { model: Portfolios, as: 'toPortfolio' },
      { model: Portfolios, as: 'fromPortfolio' },
      { model: Currencies, as: 'currency' },
    ],
  });
};

export const directCashTransaction = withTransaction(directCashTransactionImpl);
