import { VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import { Money } from '@common/types/money';
import VentureDeals from '@models/venture/venture-deals.model';
import VentureEvents from '@models/venture/venture-events.model';

import { CARRY_BEARING_EVENT_TYPES } from './event-helpers';
import { prepareEventValues } from './prepare-event-values';

/**
 * Cascading recompute: after a cash event is edited or deleted, the
 * `principalRemaining` chain shifts and downstream carry-bearing events'
 * auto-carry becomes stale. This walks events in chronological order,
 * recomputing carry for any that:
 *   - sit AFTER the mutated event's date (or were mutated by a delete),
 *   - are of type distribution/exit,
 *   - AND don't have `gpCarryOverridden=true` or `lpNetAmountOverridden=true`
 *     (user intent preserved).
 *
 * Returns list of recomputed event IDs so the caller can surface "Recomputed
 * N events" in the response.
 */
export async function recomputeCascade({
  userId,
  deal,
  mutatedAtDate,
}: {
  userId: number;
  deal: VentureDeals;
  mutatedAtDate: string;
}): Promise<{ recomputedEventIds: string[] }> {
  const allEvents = await VentureEvents.findAll({
    where: { dealId: deal.id },
    order: [
      ['eventDate', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });

  const recomputedEventIds: string[] = [];

  for (const event of allEvents) {
    // Only carry-bearing events need recompute
    if (!CARRY_BEARING_EVENT_TYPES.includes(event.type)) continue;
    // Only events at or after the mutation point
    if (event.eventDate < mutatedAtDate) continue;
    // Preserve user overrides
    if (event.gpCarryOverridden || event.lpNetAmountOverridden) continue;

    const priorEvents = allEvents.filter((e) => e.id !== event.id);

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
      metaData: { ...event.metaData, ...prepared.metaDataExtras },
    });

    recomputedEventIds.push(event.id);
  }

  return { recomputedEventIds };
}
