import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import LoanDetails from '@models/loan-details.model';
import Transactions from '@models/transactions.model';
import { deleteAccountById } from '@services/accounts.service';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteLoanParams {
  userId: number;
  accountId: string;
}

const deleteLoanImpl = async ({ userId, accountId }: DeleteLoanParams) => {
  // Existence + ownership guard; 404 if the loan isn't this user's.
  await findOrThrowNotFound({
    query: LoanDetails.findOne({ where: { accountId, userId }, attributes: ['id'] }),
    message: t({ key: 'loans.loanNotFound' }),
  });

  // Payment legs are real ledger entries; deleting the loan would orphan them,
  // so they hard-block. Timeline events (corrections, notes) are self-contained
  // metadata that disappears with the loan and deliberately do NOT block.
  const paymentCount = await Transactions.count({
    where: {
      accountId,
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
    },
  });
  if (paymentCount > 0) {
    throw new ValidationError({ message: t({ key: 'loans.deleteBlockedByPayments' }) });
  }

  // deleteAccountById covers share cleanup and notification fan-out; LoanDetails
  // disappears via ON DELETE CASCADE on the accountId FK.
  await deleteAccountById({ id: accountId, userId });

  return { id: accountId };
};

export const deleteLoan = withTransaction(deleteLoanImpl);
