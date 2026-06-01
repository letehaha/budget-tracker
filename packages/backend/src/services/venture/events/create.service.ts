import type { RecordId } from '@bt/shared/types';
import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ValidationError } from '@js/errors';
import VentureDeals from '@models/venture/venture-deals.model';
import VentureEventLinks from '@models/venture/venture-event-links.model';
import VentureEvents from '@models/venture/venture-events.model';
import { withTransaction } from '@services/common/with-transaction';
import { ensureUserCurrencyConnected } from '@services/sharing/auth/ensure-currency-connected.service';
import Big from 'big.js';

import { syncDealFromEvents } from '../deals/sync-deal-from-events.service';
import { linkTxsToEvent } from '../linking/link-txs-to-event.service';
import { findInitialInvestment, isCashFlowModeAllowed } from './event-helpers';
import { prepareEventValues } from './prepare-event-values';

interface CreateVentureEventParams {
  userId: number;
  dealId: string;
  type: VENTURE_EVENT_TYPE;
  eventDate: string;
  grossAmount?: string | null;
  navAfter?: string | null;
  quantityPct?: string | null;
  cashFlowMode: VENTURE_CASH_FLOW_MODE;
  transactionIds?: string[];
  lpNetAmountOverride?: string | null;
  gpCarryOverride?: string | null;
  notes?: string | null;
}

const createVentureEventImpl = async (params: CreateVentureEventParams) => {
  const { userId, dealId, type, eventDate, cashFlowMode, transactionIds = [] } = params;

  const deal = await findOrThrowNotFound({
    query: VentureDeals.findOne({ where: { id: dealId, userId } }),
    message: 'Venture deal not found',
  });

  // Auto-connect the deal's currency so downstream FX lookups (refAmount,
  // restamp) don't trip currencyNotConnected for users whose base currency
  // differs from the deal currency.
  await ensureUserCurrencyConnected({ userId, currencyCode: deal.currencyCode });

  if (!isCashFlowModeAllowed({ type, mode: cashFlowMode })) {
    throw new ValidationError({
      message: `cashFlowMode "${cashFlowMode}" is not allowed for event type "${type}"`,
    });
  }

  // Enforce one initial_investment per deal (the DB also has a partial unique index).
  if (type === VENTURE_EVENT_TYPE.initial_investment) {
    const existing = await VentureEvents.findOne({
      where: { dealId, type: VENTURE_EVENT_TYPE.initial_investment },
    });
    if (existing) {
      throw new ValidationError({ message: 'This deal already has an initial_investment event' });
    }
    // initial_investment derives lpNet from `deal.principal + deal.entryFee`. A
    // zero-principal deal would silently produce lpNet=0 and then collide with the
    // linked-tx sum check, surfacing a confusing "(0.00)" mismatch. Bail early with
    // a message that points at the actual fix.
    const principalPlusFee = new Big(deal.principal.toDecimalString(10)).plus(deal.entryFee.toDecimalString(10));
    if (principalPlusFee.lte(0)) {
      throw new ValidationError({
        message: 'Cannot create initial_investment: deal has principal=0. Edit the deal to set a principal first.',
      });
    }
  }

  const priorEvents = await VentureEvents.findAll({ where: { dealId } });

  // Non-initial events presuppose that the deal has actually been entered into.
  // Without an initial_investment, cost basis, NAV, and carry math have no
  // anchor — surface that to the user before they can build an inconsistent
  // event history (e.g. an Exit on a deal they never funded).
  if (type !== VENTURE_EVENT_TYPE.initial_investment) {
    const initial = findInitialInvestment(priorEvents);
    if (!initial) {
      throw new ValidationError({
        message: 'Add an initial investment event first before recording other events on this deal.',
      });
    }
    if (eventDate < initial.eventDate) {
      throw new ValidationError({
        message: `Event date (${eventDate}) cannot be before the initial investment date (${initial.eventDate}).`,
      });
    }
  }

  const prepared = await prepareEventValues({
    userId,
    deal,
    type,
    eventDate,
    grossAmount: params.grossAmount,
    navAfter: params.navAfter,
    quantityPct: params.quantityPct,
    priorEvents,
    lpNetAmountOverride: params.lpNetAmountOverride,
    gpCarryOverride: params.gpCarryOverride,
  });

  const event = await VentureEvents.create({
    userId,
    dealId: dealId as RecordId,
    type,
    eventDate,
    grossAmount: prepared.grossAmount !== null ? Money.fromDecimal(prepared.grossAmount) : null,
    gpCarryAmount: prepared.gpCarryAmount !== null ? Money.fromDecimal(prepared.gpCarryAmount) : null,
    lpNetAmount: prepared.lpNetAmount !== null ? Money.fromDecimal(prepared.lpNetAmount) : null,
    refAmount: prepared.refAmount !== null ? Money.fromDecimal(prepared.refAmount) : null,
    navAfter: prepared.navAfter !== null ? Money.fromDecimal(prepared.navAfter) : null,
    quantityPct: prepared.quantityPct,
    lpNetAmountOverridden: prepared.lpNetAmountOverridden,
    gpCarryOverridden: prepared.gpCarryOverridden,
    principalReturnedThisEvent: prepared.principalReturnedThisEvent,
    currencyCode: deal.currencyCode,
    cashFlowMode,
    notes: params.notes ?? null,
    metaData: prepared.metaDataExtras,
  });

  if (cashFlowMode === VENTURE_CASH_FLOW_MODE.linked) {
    if (transactionIds.length === 0) {
      throw new ValidationError({ message: 'cashFlowMode=linked requires at least one transactionId' });
    }
    await linkTxsToEvent({ userId, eventId: event.id, transactionIds });
  } else if (transactionIds.length > 0) {
    throw new ValidationError({
      message: `cashFlowMode=${cashFlowMode} cannot accept transactionIds`,
    });
  }

  await syncDealFromEvents({ userId, deal, mutatedAtDate: eventDate });

  return event.reload({
    include: [{ model: VentureEventLinks, as: 'links' }],
  });
};

export const createVentureEvent = withTransaction(createVentureEventImpl);
