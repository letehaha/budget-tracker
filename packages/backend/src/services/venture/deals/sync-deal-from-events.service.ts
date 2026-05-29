import { VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import { Money } from '@common/types/money';
import VentureDeals from '@models/venture/venture-deals.model';
import VentureEvents from '@models/venture/venture-events.model';

import { progressDealStatus } from '../deals-status/progress-status';
import { CARRY_BEARING_EVENT_TYPES } from '../events/event-helpers';
import { prepareEventValues } from '../events/prepare-event-values';

/**
 * Single owner of "deal stays consistent with its events". Called by every
 * event mutation path (create/update/delete) with the date of the earliest
 * impacted event. Performs the cascade carry-recompute on downstream
 * carry-bearing events, then recomputes status from the full event list,
 * persisting the deal only if status changed.
 *
 * Loads the event list once and reuses it for both passes — the previous
 * design ran two findAll calls per mutation (cascade + status).
 */
export async function syncDealFromEvents({
  userId,
  deal,
  mutatedAtDate,
}: {
  userId: number;
  deal: VentureDeals;
  mutatedAtDate: string;
}): Promise<{ recomputedEventIds: string[] }> {
  const events = await VentureEvents.findAll({
    where: { dealId: deal.id },
    order: [
      ['eventDate', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });

  const recomputedEventIds: string[] = [];

  for (const event of events) {
    if (!CARRY_BEARING_EVENT_TYPES.includes(event.type)) continue;
    if (event.eventDate < mutatedAtDate) continue;
    if (event.gpCarryOverridden || event.lpNetAmountOverridden) continue;

    const priorEvents = events.filter((e) => e.id !== event.id);

    const prepared = await prepareEventValues({
      userId,
      deal,
      type: event.type as VENTURE_EVENT_TYPE,
      eventDate: event.eventDate,
      grossAmount: event.grossAmount ? event.grossAmount.toDecimalString(10) : null,
      navAfter: event.navAfter ? event.navAfter.toDecimalString(10) : null,
      quantityPct: event.quantityPct,
      priorEvents,
      excludeEventId: event.id,
    });

    await event.update({
      gpCarryAmount: prepared.gpCarryAmount !== null ? Money.fromDecimal(prepared.gpCarryAmount) : null,
      lpNetAmount: prepared.lpNetAmount !== null ? Money.fromDecimal(prepared.lpNetAmount) : null,
      refAmount: prepared.refAmount !== null ? Money.fromDecimal(prepared.refAmount) : null,
      principalReturnedThisEvent: prepared.principalReturnedThisEvent,
      metaData: { ...event.metaData, ...prepared.metaDataExtras },
    });

    recomputedEventIds.push(event.id);
  }

  const nextStatus = progressDealStatus({
    events: events.map((e) => ({
      type: e.type,
      navAfter: e.navAfter ? e.navAfter.toDecimalString(10) : null,
    })),
  });
  if (nextStatus !== deal.status) {
    await deal.update({ status: nextStatus });
  }

  return { recomputedEventIds };
}
