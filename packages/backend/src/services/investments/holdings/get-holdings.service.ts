import { NotFoundError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Holdings from '@models/investments/Holdings.model';
import Securities from '@models/investments/Securities.model';
import { withTransaction } from '@services/common';

const getHoldingsImpl = async (accountId: number, userId: number) => {
  const account = await Accounts.findOne({ where: { id: accountId, userId } });
  if (!account) {
    throw new NotFoundError({ message: 'Account not found.' });
  }

  return Holdings.findAll({
    where: { accountId },
    include: [Securities], // Include security details with each holding
    order: [[{ model: Securities, as: 'security' }, 'symbol', 'ASC']],
  });
};

export const getHoldings = withTransaction(getHoldingsImpl);
