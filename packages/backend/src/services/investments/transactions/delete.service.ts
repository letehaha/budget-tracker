import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import { withTransaction } from '@services/common';
import { recalculateHolding } from '@services/investments/holdings/recalculation.service';

interface DeleteTransactionParams {
  userId: number;
  transactionId: number;
}

const deleteInvestmentTransactionImpl = async ({ userId, transactionId }: DeleteTransactionParams) => {
  // Find the transaction and verify ownership through portfolio
  const transaction = await InvestmentTransaction.findOne({
    where: { id: transactionId },
    include: [{ model: Portfolios, as: 'portfolio', where: { userId }, required: true }],
  });

  if (!transaction) {
    return { success: true };
  }

  // Store the portfolioId and securityId for recalculation before deletion
  const { portfolioId, securityId } = transaction;

  // Delete the transaction
  await transaction.destroy();

  // After deleting the transaction, trigger a full recalculation of the holding
  await recalculateHolding({ portfolioId, securityId });

  return { success: true };
};

export const deleteInvestmentTransaction = withTransaction(deleteInvestmentTransactionImpl);
