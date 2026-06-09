import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import LoanDetails from '@models/loan-details.model';
import { deleteAccountById } from '@services/accounts.service';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteLoanParams {
  userId: number;
  accountId: string;
}

const deleteLoanImpl = async ({ userId, accountId }: DeleteLoanParams) => {
  // Verify ownership of the LoanDetails row before delegating to the Account
  // delete path. deleteAccountById is owner-scoped on its own, but starting
  // from the sidecar makes the 404 message specific to loans.
  await findOrThrowNotFound({
    query: LoanDetails.findOne({ where: { accountId, userId }, attributes: ['id'] }),
    message: t({ key: 'loans.loanNotFound' }),
  });

  // Delegating to deleteAccountById covers share cleanup, cross-user transfer
  // conversion, and post-commit notification fan-out. The LoanDetails row
  // disappears via ON DELETE CASCADE on the accountId FK.
  await deleteAccountById({ id: accountId, userId });

  return { id: accountId };
};

export const deleteLoan = withTransaction(deleteLoanImpl);
