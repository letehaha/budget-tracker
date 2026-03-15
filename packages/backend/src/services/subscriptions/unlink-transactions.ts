import { SUBSCRIPTION_LINK_STATUS } from '@bt/shared/types';
import SubscriptionTransactions from '@models/SubscriptionTransactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { findSubscriptionOrThrow } from './helpers';

interface UnlinkTransactionsParams {
  subscriptionId: string;
  transactionIds: number[];
  userId: number;
}

export const unlinkTransactionsFromSubscription = withTransaction(
  async ({ subscriptionId, transactionIds, userId }: UnlinkTransactionsParams) => {
    await findSubscriptionOrThrow({ id: subscriptionId, userId });

    const [updated] = await SubscriptionTransactions.update(
      { status: SUBSCRIPTION_LINK_STATUS.unlinked },
      {
        where: {
          subscriptionId,
          transactionId: { [Op.in]: transactionIds },
          status: SUBSCRIPTION_LINK_STATUS.active,
        },
      },
    );

    return { unlinked: updated };
  },
);
