import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import Currencies from '@models/Currencies.model';
import Portfolios from '@models/investments/Portfolios.model';
import PortfolioTransfers from '@models/investments/PortfolioTransfers.model';
import * as Transactions from '@models/Transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { updatePortfolioBalance } from '@services/investments/portfolios/balances';
import { Big } from 'big.js';

interface DeletePortfolioTransferParams {
  userId: number;
  transferId: number;
  deleteLinkedTransaction?: boolean;
}

const deletePortfolioTransferImpl = async ({
  userId,
  transferId,
  deleteLinkedTransaction = false,
}: DeletePortfolioTransferParams) => {
  const transfer = await PortfolioTransfers.findOne({
    where: { id: transferId, userId },
    include: [
      { model: Portfolios, as: 'fromPortfolio' },
      { model: Portfolios, as: 'toPortfolio' },
      { model: Currencies, as: 'currency' },
    ],
  });

  if (!transfer) {
    return { success: true };
  }

  const amount = transfer.amount.toDecimalString(10);
  const { currencyCode } = transfer;

  // Reverse portfolio balance changes
  if (transfer.fromPortfolioId) {
    // Was subtracted from source portfolio → add back
    await updatePortfolioBalance({
      userId,
      portfolioId: transfer.fromPortfolioId,
      currencyCode,
      availableCashDelta: amount,
      totalCashDelta: amount,
    });
  }

  if (transfer.toPortfolioId) {
    // Was added to destination portfolio → subtract back
    const negatedAmount = new Big(amount).times(-1).toFixed(10);
    await updatePortfolioBalance({
      userId,
      portfolioId: transfer.toPortfolioId,
      currencyCode,
      availableCashDelta: negatedAmount,
      totalCashDelta: negatedAmount,
    });
  }

  // Handle linked account transaction (from account-to-portfolio or portfolio-to-account transfers)
  if (transfer.transactionId) {
    if (deleteLinkedTransaction) {
      await Transactions.deleteTransactionById({ id: transfer.transactionId, userId });
    } else {
      // Mark the linked transaction as "out of wallet" so it remains in the account
      // history but is no longer associated with any transfer
      await Transactions.updateTransactionById({
        id: transfer.transactionId,
        userId,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        transferId: null,
      });
    }
  }

  await transfer.destroy();

  return { success: true };
};

export const deletePortfolioTransfer = withTransaction(deletePortfolioTransferImpl);
