import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import VentureEventLinks from '@models/venture/venture-event-links.model';
import VentureEvents from '@models/venture/venture-events.model';
import { withTransaction } from '@services/common/with-transaction';

interface GetVentureEventParams {
  userId: number;
  eventId: string;
}

const getVentureEventImpl = async ({ userId, eventId }: GetVentureEventParams) => {
  return findOrThrowNotFound({
    query: VentureEvents.findOne({
      where: { id: eventId, userId },
      include: [{ model: VentureEventLinks, as: 'links' }],
    }),
    message: 'Venture event not found',
  });
};

export const getVentureEvent = withTransaction(getVentureEventImpl);
