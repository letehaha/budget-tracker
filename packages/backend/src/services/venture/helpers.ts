import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import VentureDeals from '@models/venture/venture-deals.model';
import VentureEventLinks from '@models/venture/venture-event-links.model';
import VentureEvents from '@models/venture/venture-events.model';

export const findVentureDealOrThrow = async ({ id, userId }: { id: string; userId: number }) => {
  return findOrThrowNotFound({
    query: VentureDeals.findOne({ where: { id, userId } }),
    message: t({ key: 'venture.dealNotFound' }),
  });
};

export const findVentureEventOrThrow = async ({
  id,
  userId,
  includeLinks = false,
}: {
  id: string;
  userId: number;
  includeLinks?: boolean;
}) => {
  return findOrThrowNotFound({
    query: VentureEvents.findOne({
      where: { id, userId },
      ...(includeLinks ? { include: [{ model: VentureEventLinks, as: 'links' }] } : {}),
    }),
    message: t({ key: 'venture.eventNotFound' }),
  });
};
