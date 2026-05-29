import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import * as Transactions from '@models/transactions.model';
import VentureDeals from '@models/venture/venture-deals.model';
import VentureEventLinks from '@models/venture/venture-event-links.model';
import VentureEvents from '@models/venture/venture-events.model';
import { withTransaction } from '@services/common/with-transaction';

import { progressDealStatus } from '../deals-status/progress-status';
import { unlinkTxFromEvent } from '../linking/unlink-tx-from-event.service';
import { recomputeCascade } from './recompute-cascade';

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
  const event = await findOrThrowNotFound({
    query: VentureEvents.findOne({
      where: { id: eventId, userId },
      include: [{ model: VentureEventLinks, as: 'links' }],
    }),
    message: 'Venture event not found',
  });

  const deal = await findOrThrowNotFound({
    query: VentureDeals.findOne({ where: { id: event.dealId, userId } }),
    message: 'Venture deal not found',
  });

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

  const { recomputedEventIds } = await recomputeCascade({
    userId,
    deal,
    mutatedAtDate: eventDateForCascade,
  });

  const remainingEvents = await VentureEvents.findAll({ where: { dealId: deal.id } });
  const nextStatus = progressDealStatus({
    events: remainingEvents.map((e) => ({
      type: e.type,
      navAfter: e.navAfter ? e.navAfter.toDecimalString(10) : null,
    })),
  });
  if (nextStatus !== deal.status) {
    await deal.update({ status: nextStatus });
  }

  return { success: true, recomputedEventIds };
};

export const deleteVentureEvent = withTransaction(deleteVentureEventImpl);
