import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import Currencies from '@models/currencies.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import * as Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { invalidatePortfolioExtendedStatsCache } from '@services/investments/portfolios/extended-stats/get-portfolio-extended-stats.service';

import { reverseTransferBalanceChanges } from './transfer-validations';

interface UnlinkTransactionFromPortfolioParams {
  userId: number;
  transactionId: number;
}

const unlinkTransactionFromPortfolioImpl = async ({ userId, transactionId }: UnlinkTransactionFromPortfolioParams) => {
  const transfer = await PortfolioTransfers.findOne({
    where: { transactionId, userId },
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

  const originalState = (transfer.metaData as Record<string, any> | null)?.originalTransactionState;

  await Transactions.updateTransactionById({
    id: transactionId,
    userId,
    transferNature: originalState?.transferNature ?? TRANSACTION_TRANSFER_NATURE.not_transfer,
  });

  const affectedPortfolioIds = new Set<number>();
  if (transfer.fromPortfolioId !== null) affectedPortfolioIds.add(transfer.fromPortfolioId);
  if (transfer.toPortfolioId !== null) affectedPortfolioIds.add(transfer.toPortfolioId);

  await transfer.destroy();

  await Promise.all(
    Array.from(affectedPortfolioIds).map((portfolioId) =>
      invalidatePortfolioExtendedStatsCache({ userId, portfolioId }),
    ),
  );

  return { success: true };
};

export const unlinkTransactionFromPortfolio = withTransaction(unlinkTransactionFromPortfolioImpl);
