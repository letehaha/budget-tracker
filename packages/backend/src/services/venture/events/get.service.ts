import { withTransaction } from '@services/common/with-transaction';

import { findVentureEventOrThrow } from '../helpers';

interface GetVentureEventParams {
  userId: number;
  eventId: string;
}

const getVentureEventImpl = async ({ userId, eventId }: GetVentureEventParams) => {
  return findVentureEventOrThrow({ id: eventId, userId, includeLinks: true });
};

export const getVentureEvent = withTransaction(getVentureEventImpl);
