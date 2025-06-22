import { TRANSACTION_TYPES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { NotFoundError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Holdings from '@models/investments/Holdings.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common';
import { recalculateHolding } from '@services/investments/holdings/recalculation.service';
import { Big } from 'big.js';

interface CreateTxParams {
  userId: number;
  accountId: number;
  securityId: number;
  category: INVESTMENT_TRANSACTION_CATEGORY;
  date: string;
  quantity: string;
  price: string;
  fees: string;
  name?: string;
}

const createInvestmentTransactionImpl = async (params: CreateTxParams) => {
  const { accountId, securityId, userId, category, quantity, price, fees, date } = params;

  const holding = await Holdings.findOne({
    where: { accountId, securityId },
    include: [{ model: Accounts, as: 'account', where: { userId }, required: true }],
  });

  if (!holding) {
    throw new NotFoundError({ message: 'Holding not found. Please add the security to the account first.' });
  }

  const amount = new Big(quantity).times(new Big(price)).toFixed(10);

  const [refAmount, refPrice, refFees] = await Promise.all([
    calculateRefAmount({
      amount: parseFloat(amount),
      userId,
      date,
      baseCode: holding.currencyCode,
    }),
    calculateRefAmount({
      amount: parseFloat(price),
      userId,
      date,
      baseCode: holding.currencyCode,
    }),
    calculateRefAmount({
      amount: parseFloat(fees),
      userId,
      date,
      baseCode: holding.currencyCode,
    }),
  ]);

  const newTx = await InvestmentTransaction.create({
    ...params,
    amount,
    refAmount: refAmount.toString(),
    refPrice: refPrice.toString(),
    refFees: refFees.toString(),
    transactionType:
      category === INVESTMENT_TRANSACTION_CATEGORY.buy ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
  });

  // After creating the transaction, trigger a full recalculation of the holding
  await recalculateHolding({ accountId, securityId });

  return newTx;
};

export const createInvestmentTransaction = withTransaction(createInvestmentTransactionImpl);
