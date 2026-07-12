import { VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import { ValidationError } from '@js/errors';
import * as Transactions from '@models/transactions.model';
import VentureEvents from '@models/venture/venture-events.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { syncDealFromEvents } from '../deals/sync-deal-from-events.service';
import { findVentureDealOrThrow, findVentureEventOrThrow } from '../helpers';
import { unlinkTxFromEvent } from '../linking/unlink-tx-from-event.service';

interface DeleteVentureEventParams {
  userId: number;
  eventId: string;
  /** When true, also deletes the linked transaction rows themselves (not just unlinks). */
  deleteLinkedTransactions?: boolean;
}

const deleteVentureEventImpl = async ({
  userId,
  eventId,
  deleteLinkedTransactions = false,
}: DeleteVentureEventParams) => {
  const event = await findVentureEventOrThrow({ id: eventId, userId, includeLinks: true });

  const deal = await findVentureDealOrThrow({ id: event.dealId, userId });

  // The initial_investment is the anchor for every other event's cost-basis +
  // chronology check. Removing it while later events still exist would leave
  // those events referencing a deal with no entry point.
  if (event.type === VENTURE_EVENT_TYPE.initial_investment) {
    const otherEventsCount = await VentureEvents.count({
      where: { dealId: event.dealId, id: { [Op.ne]: event.id } },
    });
    if (otherEventsCount > 0) {
      throw new ValidationError({
        message: 'Delete the other events first before deleting the initial investment.',
      });
    }
  }

  const eventDateForCascade = event.eventDate;
  const links = event.links ?? [];

  // Unlink each tx (restores original state). Done before destroying the event
  // because deleting the event would CASCADE the link rows and lose the snapshot.
  for (const link of links) {
    await unlinkTxFromEvent({ userId, linkId: link.id });

    if (deleteLinkedTransactions) {
      await Transactions.deleteTransactionById({ id: link.transactionId, userId });
    }
  }

  await event.destroy();

  const { recomputedEventIds } = await syncDealFromEvents({
    userId,
    deal,
    mutatedAtDate: eventDateForCascade,
  });

  return { success: true, recomputedEventIds };
};

export const deleteVentureEvent = withTransaction(deleteVentureEventImpl);
