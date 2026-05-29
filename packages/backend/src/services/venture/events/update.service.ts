import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import VentureDeals from '@models/venture/venture-deals.model';
import VentureEventLinks from '@models/venture/venture-event-links.model';
import VentureEvents from '@models/venture/venture-events.model';
import { withTransaction } from '@services/common/with-transaction';

import { progressDealStatus } from '../deals-status/progress-status';
import { prepareEventValues } from './prepare-event-values';
import { recomputeCascade } from './recompute-cascade';

interface UpdateVentureEventParams {
  userId: number;
  eventId: string;
  eventDate?: string;
  grossAmount?: string | null;
  navAfter?: string | null;
  quantityPct?: string | null;
  notes?: string | null;
  /** If provided, sets gpCarry and marks `gpCarryOverridden=true`. */
  gpCarryAmount?: string | null;
  /** If provided, sets lpNet and marks `lpNetAmountOverridden=true`. */
  lpNetAmount?: string | null;
  /** When true, clears `*Overridden` flags and re-runs auto-compute. */
  resetOverrides?: boolean;
}

const updateVentureEventImpl = async (params: UpdateVentureEventParams) => {
  const { userId, eventId } = params;

  const event = await findOrThrowNotFound({
    query: VentureEvents.findOne({ where: { id: eventId, userId } }),
    message: 'Venture event not found',
  });

  const deal = await findOrThrowNotFound({
    query: VentureDeals.findOne({ where: { id: event.dealId, userId } }),
    message: 'Venture deal not found',
  });

  const previousEventDate = event.eventDate;

  const nextEventDate = params.eventDate ?? event.eventDate;
  const nextNotes = params.notes !== undefined ? params.notes : event.notes;

  // Decide whether overrides are being applied or reset
  const shouldReset = params.resetOverrides === true;
  const gpCarryOverride = shouldReset
    ? null
    : params.gpCarryAmount !== undefined
      ? params.gpCarryAmount
      : event.gpCarryOverridden
        ? event.gpCarryAmount
          ? event.gpCarryAmount.toDecimalString(10)
          : null
        : null;
  const lpNetOverride = shouldReset
    ? null
    : params.lpNetAmount !== undefined
      ? params.lpNetAmount
      : event.lpNetAmountOverridden
        ? event.lpNetAmount
          ? event.lpNetAmount.toDecimalString(10)
          : null
        : null;

  // Pull all events for the deal so prepare can compute the carry chain
  const priorEvents = await VentureEvents.findAll({ where: { dealId: deal.id } });

  const prepared = await prepareEventValues({
    userId,
    deal,
    type: event.type,
    eventDate: nextEventDate,
    grossAmount:
      params.grossAmount !== undefined
        ? params.grossAmount
        : event.grossAmount
          ? event.grossAmount.toDecimalString(10)
          : null,
    navAfter:
      params.navAfter !== undefined ? params.navAfter : event.navAfter ? event.navAfter.toDecimalString(10) : null,
    quantityPct: params.quantityPct !== undefined ? params.quantityPct : event.quantityPct,
    priorEvents,
    excludeEventId: event.id,
    lpNetAmountOverride: lpNetOverride,
    gpCarryOverride: gpCarryOverride,
  });

  await event.update({
    eventDate: nextEventDate,
    grossAmount: prepared.grossAmount !== null ? Money.fromDecimal(prepared.grossAmount) : null,
    gpCarryAmount: prepared.gpCarryAmount !== null ? Money.fromDecimal(prepared.gpCarryAmount) : null,
    lpNetAmount: prepared.lpNetAmount !== null ? Money.fromDecimal(prepared.lpNetAmount) : null,
    refAmount: prepared.refAmount !== null ? Money.fromDecimal(prepared.refAmount) : null,
    navAfter: prepared.navAfter !== null ? Money.fromDecimal(prepared.navAfter) : null,
    quantityPct: prepared.quantityPct,
    lpNetAmountOverridden: prepared.lpNetAmountOverridden,
    gpCarryOverridden: prepared.gpCarryOverridden,
    notes: nextNotes,
    metaData: { ...event.metaData, ...prepared.metaDataExtras },
  });

  // Cascade only kicks in for carry-bearing event changes that shift principalRemaining,
  // OR when a non-carry cash event's grossAmount changed (capital_call/fee_payment affect costBasis).
  const earliestImpactedDate = previousEventDate < nextEventDate ? previousEventDate : nextEventDate;
  const { recomputedEventIds } = await recomputeCascade({
    userId,
    deal,
    mutatedAtDate: earliestImpactedDate,
  });

  // Refresh deal status based on the updated event list
  const refreshedEvents = await VentureEvents.findAll({ where: { dealId: deal.id } });
  const nextStatus = progressDealStatus({
    events: refreshedEvents.map((e) => ({
      type: e.type,
      navAfter: e.navAfter ? e.navAfter.toDecimalString(10) : null,
    })),
  });
  if (nextStatus !== deal.status) {
    await deal.update({ status: nextStatus });
  }

  const reloaded = await event.reload({
    include: [{ model: VentureEventLinks, as: 'links' }],
  });

  return { event: reloaded, recomputedEventIds };
};

export const updateVentureEvent = withTransaction(updateVentureEventImpl);
