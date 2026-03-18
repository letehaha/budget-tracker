import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Currencies from '@models/Currencies.model';
import Portfolios from '@models/investments/Portfolios.model';
import PortfolioTransfers from '@models/investments/PortfolioTransfers.model';
import { withTransaction } from '@services/common/with-transaction';
import { updatePortfolioBalance } from '@services/investments/portfolios/balances';

import {
  computeRefAmount,
  findCurrencyOrThrow,
  findPortfolioOrThrow,
  negateAmount,
  validatePositiveAmount,
} from './transfer-validations';

interface ExchangeCurrencyParams {
  userId: number;
  portfolioId: number;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  fromAmount: string;
  toAmount: string;
  date: string;
  description?: string | null;
}

const exchangeCurrencyImpl = async ({
  userId,
  portfolioId,
  fromCurrencyCode,
  toCurrencyCode,
  fromAmount,
  toAmount,
  date,
  description,
}: ExchangeCurrencyParams) => {
  if (fromCurrencyCode === toCurrencyCode) {
    throw new ValidationError({ message: t({ key: 'investments.exchangeCurrenciesMustDiffer' }) });
  }

  validatePositiveAmount({ amount: fromAmount });
  validatePositiveAmount({ amount: toAmount });

  await findPortfolioOrThrow({ portfolioId, userId, role: 'generic' });
  await findCurrencyOrThrow({ currencyCode: fromCurrencyCode });
  await findCurrencyOrThrow({ currencyCode: toCurrencyCode });

  const refAmount = await computeRefAmount({ amount: fromAmount, currencyCode: fromCurrencyCode, userId, date });
  const refToAmount = await computeRefAmount({ amount: toAmount, currencyCode: toCurrencyCode, userId, date });

  const transfer = await PortfolioTransfers.create({
    userId,
    fromPortfolioId: portfolioId,
    toPortfolioId: portfolioId,
    fromAccountId: null,
    toAccountId: null,
    amount: fromAmount,
    refAmount,
    currencyCode: fromCurrencyCode,
    toCurrencyCode,
    toAmount,
    refToAmount,
    date,
    description,
  });

  // Subtract fromAmount from the source currency balance
  const negated = negateAmount({ amount: fromAmount });
  await updatePortfolioBalance({
    userId,
    portfolioId,
    currencyCode: fromCurrencyCode,
    availableCashDelta: negated,
    totalCashDelta: negated,
  });

  // Add toAmount to the target currency balance (auto-creates if doesn't exist)
  await updatePortfolioBalance({
    userId,
    portfolioId,
    currencyCode: toCurrencyCode,
    availableCashDelta: toAmount,
    totalCashDelta: toAmount,
  });

  return transfer.reload({
    include: [
      { model: Portfolios, as: 'fromPortfolio' },
      { model: Portfolios, as: 'toPortfolio' },
      { model: Currencies, as: 'currency' },
      { model: Currencies, as: 'toCurrency' },
    ],
  });
};

export const exchangeCurrency = withTransaction(exchangeCurrencyImpl);
