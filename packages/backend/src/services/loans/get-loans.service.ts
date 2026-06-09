import Accounts from '@models/accounts.model';
import LoanDetails from '@models/loan-details.model';

export const getLoans = async ({ userId }: { userId: number }) => {
  return LoanDetails.findAll({
    where: { userId },
    include: [{ model: Accounts, as: 'account' }],
    order: [['createdAt', 'DESC']],
  });
};
