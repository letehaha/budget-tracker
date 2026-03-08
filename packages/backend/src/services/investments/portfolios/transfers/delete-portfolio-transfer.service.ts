import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import Currencies from '@models/Currencies.model';
import Portfolios from '@models/investments/Portfolios.model';
import PortfolioTransfers from '@models/investments/PortfolioTransfers.model';
import * as Transactions from '@models/Transactions.model';
import { withTransaction } from '@services/common/with-transaction';

import { reverseTransferBalanceChanges } from './transfer-validations';

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

  await reverseTransferBalanceChanges({ transfer, userId });

  // Handle linked account transaction (from account-to-portfolio or portfolio-to-account transfers)
  if (transfer.transactionId) {
    if (deleteLinkedTransaction) {
      await Transactions.deleteTransactionById({ id: transfer.transactionId, userId });
    } else {
      const originalState = (transfer.metaData as Record<string, any> | null)?.originalTransactionState;

      await Transactions.updateTransactionById({
        id: transfer.transactionId,
        userId,
        transferNature: originalState?.transferNature ?? TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        transferId: originalState?.transferId ?? null,
      });
    }
  }

  await transfer.destroy();

  return { success: true };
};

export const deletePortfolioTransfer = withTransaction(deletePortfolioTransferImpl);
