import VentureEventLinks from '@models/venture/venture-event-links.model';
import VentureEvents from '@models/venture/venture-events.model';
import { withTransaction } from '@services/common/with-transaction';

interface ListVentureEventsParams {
  userId: number;
  dealId: string;
}

const listVentureEventsImpl = async ({ userId, dealId }: ListVentureEventsParams) => {
  return VentureEvents.findAll({
    where: { userId, dealId },
    order: [
      ['eventDate', 'ASC'],
      ['createdAt', 'ASC'],
    ],
    include: [{ model: VentureEventLinks, as: 'links' }],
  });
};

export const listVentureEvents = withTransaction(listVentureEventsImpl);
