import { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import Currencies from '@models/Currencies.model';
import Portfolios from '@models/investments/Portfolios.model';
import PortfolioTransfers from '@models/investments/PortfolioTransfers.model';
import * as Transactions from '@models/Transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { updatePortfolioBalance } from '@services/investments/portfolios/balances';
import { Big } from 'big.js';

import {
  computeRefAmount,
  findAccountOrThrow,
  findCurrencyOrThrow,
  findPortfolioOrThrow,
  validatePositiveAmount,
} from './transfer-validations';

interface PortfolioToAccountTransferParams {
  userId: number;
  portfolioId: number;
  accountId: number;
  amount: string;
  currencyCode: string;
  date: string;
  description?: string | null;
  existingTransactionId?: number;
}

const portfolioToAccountTransferImpl = async ({
  userId,
  portfolioId,
  accountId,
  amount,
  currencyCode,
  date,
  description,
  existingTransactionId,
}: PortfolioToAccountTransferParams) => {
  validatePositiveAmount({ amount });

  await findPortfolioOrThrow({ portfolioId, userId, role: 'source' });
  const account = await findAccountOrThrow({ accountId, userId, role: 'destination' });
  await findCurrencyOrThrow({ currencyCode });

  const refAmount = await computeRefAmount({ amount, currencyCode, userId, date });

  let linkedTransactionId: number;

  if (existingTransactionId) {
    // Link to an existing income transaction
    const existingTx = await Transactions.getTransactionById({
      id: existingTransactionId,
      userId,
    });

    if (!existingTx) {
      throw new NotFoundError({ message: t({ key: 'transactions.notFound' }) });
    }

    if (existingTx.transactionType !== TRANSACTION_TYPES.income) {
      throw new ValidationError({
        message: 'Only income transactions can be linked to portfolio withdrawals.',
      });
    }

    // Check if this transaction is already linked to a portfolio transfer
    const existingLink = await PortfolioTransfers.findOne({
      where: { transactionId: existingTransactionId },
    });

    if (existingLink) {
      throw new ValidationError({
        message: 'Transaction is already linked to a portfolio transfer.',
      });
    }

    // Update the existing transaction's transferNature
    await Transactions.updateTransactionById({
      id: existingTransactionId,
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
    });

    linkedTransactionId = existingTransactionId;
  } else {
    // Create a new income Transaction on the account
    const txAmount = Money.fromDecimal(amount);
    const txRefAmount = await computeRefAmount({ amount, currencyCode: account.currencyCode, userId, date });

    const newTx = await Transactions.createTransaction({
      userId,
      amount: txAmount,
      refAmount: txRefAmount,
      transactionType: TRANSACTION_TYPES.income,
      paymentType: PAYMENT_TYPES.bankTransfer,
      accountId,
      accountType: account.type,
      currencyCode: account.currencyCode,
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
      time: new Date(date),
      note: description || undefined,
    });

    linkedTransactionId = newTx!.id;
  }

  // Create PortfolioTransfer record linked to the transaction
  const transfer = await PortfolioTransfers.create({
    userId,
    fromPortfolioId: portfolioId,
    toAccountId: accountId,
    fromAccountId: null,
    toPortfolioId: null,
    amount,
    refAmount,
    currencyCode,
    date,
    description,
    transactionId: linkedTransactionId,
  });

  // Update portfolio cash balance (decrease)
  const negatedAmount = new Big(amount).times(-1).toFixed(10);
  await updatePortfolioBalance({
    userId,
    portfolioId,
    currencyCode,
    availableCashDelta: negatedAmount,
    totalCashDelta: negatedAmount,
  });

  return transfer.reload({
    include: [
      { model: Portfolios, as: 'fromPortfolio' },
      { model: Currencies, as: 'currency' },
    ],
  });
};

export const portfolioToAccountTransfer = withTransaction(portfolioToAccountTransferImpl);
