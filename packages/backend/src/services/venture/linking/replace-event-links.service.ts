import VentureEventLinks from '@models/venture/venture-event-links.model';
import { withTransaction } from '@services/common/with-transaction';

import { linkTxsToEvent } from './link-txs-to-event.service';
import { unlinkTxFromEvent } from './unlink-tx-from-event.service';

interface ReplaceEventLinksParams {
  userId: number;
  eventId: string;
  transactionIds: string[];
}

/**
 * Atomic replace-all for an event's tx links. Unlinks every existing link
 * (restoring tx state), then re-links the new set. Used by the event-edit
 * flow when the user changes which txs back this event.
 */
const replaceEventLinksImpl = async ({ userId, eventId, transactionIds }: ReplaceEventLinksParams) => {
  const existing = await VentureEventLinks.findAll({
    where: { ventureEventId: eventId },
    include: [{ association: 'event', where: { userId }, required: true }],
  });

  for (const link of existing) {
    await unlinkTxFromEvent({ userId, linkId: link.id });
  }

  const newLinks = transactionIds.length > 0 ? await linkTxsToEvent({ userId, eventId, transactionIds }) : [];

  return newLinks;
};

export const replaceEventLinks = withTransaction(replaceEventLinksImpl);
