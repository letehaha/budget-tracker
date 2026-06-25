import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Accounts from '@models/accounts.model';
import LoanDetails from '@models/loan-details.model';

export const getLoanById = ({ userId, accountId }: { userId: number; accountId: string }) => {
  return findOrThrowNotFound({
    query: LoanDetails.findOne({
      where: { accountId, userId },
      include: [{ model: Accounts, as: 'account' }],
    }),
    message: t({ key: 'loans.loanNotFound' }),
  });
};
