import Accounts from '@models/Accounts.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import { withTransaction } from '@services/common';
import { recalculateHolding } from '@services/investments/holdings/recalculation.service';

interface DeleteTransactionParams {
  userId: number;
  transactionId: number;
}

const deleteInvestmentTransactionImpl = async ({ userId, transactionId }: DeleteTransactionParams) => {
  // Find the transaction and verify ownership through account
  const transaction = await InvestmentTransaction.findOne({
    where: { id: transactionId },
    include: [{ model: Accounts, as: 'account', where: { userId }, required: true }],
  });

  if (!transaction) {
    return { success: true };
  }

  // Store the accountId and securityId for recalculation before deletion
  const { accountId, securityId } = transaction;

  // Delete the transaction
  await transaction.destroy();

  // After deleting the transaction, trigger a full recalculation of the holding
  await recalculateHolding({ accountId, securityId });

  return { success: true };
};

export const deleteInvestmentTransaction = withTransaction(deleteInvestmentTransactionImpl);
