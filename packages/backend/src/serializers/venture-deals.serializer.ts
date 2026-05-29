/**
 * Venture Deal Serializers
 *
 * Shapes VentureDeals rows for API responses. Drops persistence-only fields
 * (createdAt, updatedAt, deletedAt, metaData) so the wire matches the shared
 * VentureDealModel contract consumed by the frontend.
 */
import type { CurrencyModel, VentureDealModel } from '@bt/shared/types';
import type Currencies from '@models/currencies.model';
import type VentureDeals from '@models/venture/venture-deals.model';

import { serializeVentureEvents } from './venture-events.serializer';
import { serializeVenturePlatform } from './venture-platforms.serializer';

function serializeCurrency(currency: Currencies): CurrencyModel {
  return {
    currency: currency.currency,
    digits: currency.digits,
    number: currency.number,
    code: currency.code,
    isDisabled: currency.isDisabled,
  };
}

export function serializeVentureDeal(deal: VentureDeals): VentureDealModel {
  return {
    id: deal.id,
    userId: deal.userId,
    platformId: deal.platformId,
    name: deal.name,
    vehicleType: deal.vehicleType,
    spvSubtype: deal.spvSubtype,
    targetCompany: deal.targetCompany,
    currencyCode: deal.currencyCode,
    status: deal.status,
    principal: deal.principal.toDecimalString(10),
    entryFee: deal.entryFee.toDecimalString(10),
    entryFeePct: deal.entryFeePct,
    mgmtFeePct: deal.mgmtFeePct,
    carryPct: deal.carryPct,
    hurdlePct: deal.hurdlePct,
    investmentDate: deal.investmentDate,
    expectedExitDate: deal.expectedExitDate,
    notes: deal.notes,
    platform: deal.platform ? serializeVenturePlatform(deal.platform) : undefined,
    currency: deal.currency ? serializeCurrency(deal.currency) : undefined,
    events: deal.events ? serializeVentureEvents(deal.events) : undefined,
  };
}

export function serializeVentureDeals(deals: VentureDeals[]): VentureDealModel[] {
  return deals.map(serializeVentureDeal);
}
