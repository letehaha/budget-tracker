import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import VentureEvents from '@models/venture/venture-events.model';
import Big from 'big.js';
import { differenceInDays } from 'date-fns';

// Cash-bearing events require a `cashFlowMode` other than `none`.
const CASH_FLOW_EVENT_TYPES: readonly VENTURE_EVENT_TYPE[] = [
  VENTURE_EVENT_TYPE.initial_investment,
  VENTURE_EVENT_TYPE.capital_call,
  VENTURE_EVENT_TYPE.distribution,
  VENTURE_EVENT_TYPE.exit,
  VENTURE_EVENT_TYPE.fee_payment,
];

/** Event types that may bear carry (LP-positive cash, GP earns share). */
export const CARRY_BEARING_EVENT_TYPES: readonly VENTURE_EVENT_TYPE[] = [
  VENTURE_EVENT_TYPE.distribution,
  VENTURE_EVENT_TYPE.exit,
];

// NAV-bearing events: must specify navAfter, no cash flow.
const NAV_ONLY_EVENT_TYPES: readonly VENTURE_EVENT_TYPE[] = [
  VENTURE_EVENT_TYPE.nav_update,
  VENTURE_EVENT_TYPE.writedown,
];

/**
 * Sum of LP principal already returned across all distribution/exit events
 * STRICTLY BEFORE the given event (by date asc, then by createdAt asc as a
 * tiebreaker for events on the same day). Used by carry computation.
 *
 * "Principal returned" comes from each prior event's
 * `metaData.principalReturnedThisEvent` snapshot (written at create time).
 * Falls back to deriving it from the event's grossAmount when the snapshot
 * is missing (e.g., legacy data).
 */
export function computeCumulativePrincipalReturnedBefore({
  events,
  beforeEvent,
  costBasis,
}: {
  events: readonly VentureEvents[];
  beforeEvent: { eventDate: string; id: string | null };
  costBasis: string;
}): string {
  const sorted = [...events].sort((a, b) => {
    const dateCmp = a.eventDate.localeCompare(b.eventDate);
    if (dateCmp !== 0) return dateCmp;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  let cumulative = new Big(0);
  const basis = new Big(costBasis);

  for (const event of sorted) {
    if (event.id === beforeEvent.id) continue;
    if (event.eventDate > beforeEvent.eventDate) continue;
    if (event.type !== VENTURE_EVENT_TYPE.distribution && event.type !== VENTURE_EVENT_TYPE.exit) {
      continue;
    }

    const snapshot = event.metaData?.principalReturnedThisEvent;
    if (typeof snapshot === 'string' && /^-?\d+(\.\d+)?$/.test(snapshot)) {
      cumulative = cumulative.plus(snapshot);
      continue;
    }

    // Fallback: derive from grossAmount capped by remaining principal.
    const gross = event.grossAmount ? new Big(event.grossAmount.toDecimalString(10)) : new Big(0);
    const principalRemaining = basis.minus(cumulative);
    const remainingClamped = principalRemaining.gt(0) ? principalRemaining : new Big(0);
    const principalThisEvent = gross.gt(remainingClamped) ? remainingClamped : gross;
    cumulative = cumulative.plus(principalThisEvent);
  }

  return cumulative.toFixed(10);
}

/**
 * Years held from investmentDate to eventDate (fractional, never negative).
 */
export function computeYearsHeld({ investmentDate, eventDate }: { investmentDate: string; eventDate: string }): number {
  const invDate = new Date(investmentDate);
  const evtDate = new Date(eventDate);
  const days = differenceInDays(evtDate, invDate);
  return Math.max(days / 365.25, 0);
}

// computeCostBasis lives in `metrics/compute-cost-basis.ts` (canonical home
// for cross-feature pure fns). Re-exported here so prepare-event-values + the
// metrics composite share the same impl.
export { computeCostBasis } from '../metrics/compute-cost-basis';

/**
 * Validates that the user-supplied `cashFlowMode` matches the event type's
 * allowed modes:
 *   - nav_update / writedown → MUST be 'none'
 *   - cash-bearing events    → MUST be 'linked' or 'out_of_wallet'
 */
export function isCashFlowModeAllowed({
  type,
  mode,
}: {
  type: VENTURE_EVENT_TYPE;
  mode: VENTURE_CASH_FLOW_MODE;
}): boolean {
  if (NAV_ONLY_EVENT_TYPES.includes(type)) {
    return mode === VENTURE_CASH_FLOW_MODE.none;
  }
  if (CASH_FLOW_EVENT_TYPES.includes(type)) {
    return mode === VENTURE_CASH_FLOW_MODE.linked || mode === VENTURE_CASH_FLOW_MODE.out_of_wallet;
  }
  return false;
}
