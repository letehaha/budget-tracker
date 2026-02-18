import { TRANSACTION_TYPES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Holdings from '@models/investments/Holdings.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { recalculateHolding } from '@services/investments/holdings/recalculation.service';
import { Big } from 'big.js';

interface CreateTxParams {
  userId: number;
  portfolioId: number;
  securityId: number;
  category: INVESTMENT_TRANSACTION_CATEGORY;
  date: string;
  quantity: string;
  price: string;
  fees: string;
  name?: string;
}

const createInvestmentTransactionImpl = async (params: CreateTxParams) => {
  const { portfolioId, securityId, userId, category, quantity, price, fees, date } = params;

  // Verify portfolio exists and user owns it
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
  });

  if (!portfolio) {
    throw new NotFoundError({ message: t({ key: 'investments.portfolioNotFound' }) });
  }

  const holding = await Holdings.findOne({
    where: { portfolioId, securityId },
    include: [{ model: Portfolios, as: 'portfolio', where: { userId }, required: true }],
  });

  if (!holding) {
    throw new NotFoundError({ message: t({ key: 'investments.holdingNotFoundAddSecurity' }) });
  }

  // Business rule: Allow selling more than owned (phantom shares treated as zero cost basis)
  // The gains calculation and recalculation services will handle this scenario

  const amountStr = new Big(quantity).times(new Big(price)).plus(new Big(fees)).toFixed(10);

  const [refAmount, refPrice, refFees] = await Promise.all([
    calculateRefAmount({
      amount: Money.fromDecimal(amountStr),
      userId,
      date,
      baseCode: holding.currencyCode,
    }),
    calculateRefAmount({
      amount: Money.fromDecimal(price),
      userId,
      date,
      baseCode: holding.currencyCode,
    }),
    calculateRefAmount({
      amount: Money.fromDecimal(fees),
      userId,
      date,
      baseCode: holding.currencyCode,
    }),
  ]);

  const newTx = await InvestmentTransaction.create({
    ...params,
    amount: amountStr,
    refAmount,
    refPrice,
    refFees,
    transactionType:
      category === INVESTMENT_TRANSACTION_CATEGORY.buy ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
  });

  // After creating the transaction, trigger a full recalculation of the holding
  await recalculateHolding({ portfolioId, securityId });

  return newTx;
};

export const createInvestmentTransaction = withTransaction(createInvestmentTransactionImpl);
