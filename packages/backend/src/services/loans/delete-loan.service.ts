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

  // Payment legs are real ledger entries on the loan account – deleting the loan
  // would orphan them and discard the principal-paid history, so they hard-block
  // deletion. Timeline events (balance corrections, notes, rate/term changes) are
  // self-contained metadata that disappears with the loan, so they deliberately
  // do NOT block: a user who wants the loan gone shouldn't be forced to archive
  // over a correction or note. Archiving stays available for those who want to
  // keep the timeline.
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

  // Delegating to deleteAccountById covers share cleanup, cross-user transfer
  // conversion, and post-commit notification fan-out. The LoanDetails row
  // disappears via ON DELETE CASCADE on the accountId FK.
  await deleteAccountById({ id: accountId, userId });

  return { id: accountId };
};

export const deleteLoan = withTransaction(deleteLoanImpl);
