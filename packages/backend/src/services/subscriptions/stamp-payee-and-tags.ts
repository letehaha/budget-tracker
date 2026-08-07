import { connection } from '@models/connection';
import Subscriptions from '@models/subscriptions.model';
import Transactions from '@models/transactions.model';
import { DOMAIN_EVENTS, eventBus } from '@services/common/event-bus';
import { withTransaction } from '@services/common/with-transaction';
import { Op, QueryTypes } from 'sequelize';

import { getSubscriptionTagIds } from './subscription-tags';

interface StampParams {
  subscription: Subscriptions;
  transactionIds: string[];
}

/**
 * Payee is written only where the row has none and payeeLocked is false: an
 * explicit payee, or one the user deliberately cleared, outranks the
 * subscription. Tags are an add-only merge, existing row tags are kept.
 */
export const stampSubscriptionPayeeAndTags = withTransaction(
  async ({ subscription, transactionIds }: StampParams): Promise<void> => {
    if (transactionIds.length === 0) return;

    if (subscription.payeeId) {
      await Transactions.update(
        { payeeId: subscription.payeeId },
        { where: { id: { [Op.in]: transactionIds }, payeeId: null, payeeLocked: false } },
      );
    }

    const tagIds = await getSubscriptionTagIds({ subscriptionId: subscription.id });
    if (tagIds.length === 0) return;

    // RETURNING reports only the pairs that actually inserted, so the reminder
    // event fires only when a row genuinely gained a tag.
    const insertedRows: { transactionId: string }[] = await connection.sequelize.query(
      `
      INSERT INTO "TransactionTags" ("tagId", "transactionId")
      SELECT st."tagId", t."id"
        FROM "Transactions" t
        CROSS JOIN "SubscriptionTags" st
       WHERE t."id" IN (:transactionIds)
         AND st."subscriptionId" = :subscriptionId
      ON CONFLICT DO NOTHING
      RETURNING "transactionId"
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { subscriptionId: subscription.id, transactionIds },
      },
    );

    if (insertedRows.length > 0) {
      eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_TAGGED, { tagIds, userId: subscription.userId });
    }
  },
);
