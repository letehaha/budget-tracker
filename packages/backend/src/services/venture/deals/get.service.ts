import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import Currencies from '@models/currencies.model';
import VentureDeals from '@models/venture/venture-deals.model';
import VentureEvents from '@models/venture/venture-events.model';
import VenturePlatforms from '@models/venture/venture-platforms.model';
import { withTransaction } from '@services/common/with-transaction';

interface GetVentureDealParams {
  userId: number;
  dealId: string;
  includeEvents?: boolean;
}

const getVentureDealImpl = async ({ userId, dealId, includeEvents = false }: GetVentureDealParams) => {
  return findOrThrowNotFound({
    query: VentureDeals.findOne({
      where: { id: dealId, userId },
      include: [
        { model: VenturePlatforms, as: 'platform' },
        { model: Currencies, as: 'currency' },
        ...(includeEvents ? [{ model: VentureEvents, as: 'events' }] : []),
      ],
    }),
    message: 'Venture deal not found',
  });
};

export const getVentureDeal = withTransaction(getVentureDealImpl);
