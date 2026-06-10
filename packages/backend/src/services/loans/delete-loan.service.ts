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
  const loanDetails = await findOrThrowNotFound({
    query: LoanDetails.findOne({ where: { accountId, userId }, attributes: ['id', 'events'] }),
    message: t({ key: 'loans.loanNotFound' }),
  });

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

  if (loanDetails.events.length > 0) {
    throw new ValidationError({ message: t({ key: 'loans.deleteBlockedByEvents' }) });
  }

  // Delegating to deleteAccountById covers share cleanup, cross-user transfer
  // conversion, and post-commit notification fan-out. The LoanDetails row
  // disappears via ON DELETE CASCADE on the accountId FK.
  await deleteAccountById({ id: accountId, userId });

  return { id: accountId };
};

export const deleteLoan = withTransaction(deleteLoanImpl);
