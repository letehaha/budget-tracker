import { NotAllowedError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Holdings from '@models/investments/Holdings.model';
import { withTransaction } from '@services/common';

interface DeleteParams {
  userId: number;
  accountId: number;
  securityId: number;
}

const deleteHoldingImpl = async ({ userId, accountId, securityId }: DeleteParams) => {
  const holding = await Holdings.findOne({
    where: { accountId, securityId },
    include: [{ model: Accounts, as: 'account', where: { userId }, required: true }],
  });

  if (!holding) return;

  // Business Rule: Prevent deletion if there's an active position.
  // The user must sell or transfer all shares first.
  // TODO: improve this logic and let user delete even active positions. We just
  // need to confirm that user wants this, and if so - remove holding with(out) all transactions?
  if (parseFloat(holding.quantity) !== 0) {
    throw new NotAllowedError({
      message: 'Cannot delete a holding with an active position. Please sell or transfer all shares first.',
    });
  }

  await holding.destroy();
};

export const deleteHolding = withTransaction(deleteHoldingImpl);
