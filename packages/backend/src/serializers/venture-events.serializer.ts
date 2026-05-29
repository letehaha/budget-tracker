/**
 * Venture Event Serializers
 *
 * Shapes VentureEvents + VentureEventLinks rows for API responses. Drops
 * persistence-only fields (createdAt, updatedAt, metaData) so the wire
 * matches the shared VentureEventModel contract.
 *
 * Money columns (grossAmount, gpCarryAmount, lpNetAmount, refAmount, navAfter)
 * are emitted as decimal strings — same shape the carry/IRR computations use.
 */
import type { VentureEventLinkModel, VentureEventModel } from '@bt/shared/types';
import type VentureEventLinks from '@models/venture/venture-event-links.model';
import type VentureEvents from '@models/venture/venture-events.model';

export function serializeVentureEventLink(link: VentureEventLinks): VentureEventLinkModel {
  return {
    id: link.id,
    ventureEventId: link.ventureEventId,
    transactionId: link.transactionId,
    amount: link.amount.toDecimalString(10),
    currencyCode: link.currencyCode,
    linkedAt: link.linkedAt,
  };
}

export function serializeVentureEvent(event: VentureEvents): VentureEventModel {
  return {
    id: event.id,
    userId: event.userId,
    dealId: event.dealId,
    type: event.type,
    eventDate: event.eventDate,
    grossAmount: event.grossAmount ? event.grossAmount.toDecimalString(10) : null,
    gpCarryAmount: event.gpCarryAmount ? event.gpCarryAmount.toDecimalString(10) : null,
    lpNetAmount: event.lpNetAmount ? event.lpNetAmount.toDecimalString(10) : null,
    refAmount: event.refAmount ? event.refAmount.toDecimalString(10) : null,
    navAfter: event.navAfter ? event.navAfter.toDecimalString(10) : null,
    quantityPct: event.quantityPct,
    lpNetAmountOverridden: event.lpNetAmountOverridden,
    gpCarryOverridden: event.gpCarryOverridden,
    principalReturnedThisEvent: event.principalReturnedThisEvent,
    currencyCode: event.currencyCode,
    cashFlowMode: event.cashFlowMode,
    notes: event.notes,
    links: event.links ? event.links.map(serializeVentureEventLink) : undefined,
    currency: event.currency
      ? {
          currency: event.currency.currency,
          digits: event.currency.digits,
          number: event.currency.number,
          code: event.currency.code,
          isDisabled: event.currency.isDisabled,
        }
      : undefined,
  };
}

export function serializeVentureEvents(events: VentureEvents[]): VentureEventModel[] {
  return events.map(serializeVentureEvent);
}
