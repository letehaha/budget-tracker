import { VENTURE_DEAL_STATUS, VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import VentureEvents from '@models/venture/venture-events.model';
import Big from 'big.js';

/**
 * Current portfolio value of the deal (LP-side NAV).
 *
 *   - `fully_exited` / `written_off` → 0 (regardless of last NAV)
 *   - Latest navAfter from any NAV-bearing event (nav_update, writedown,
 *     exit, distribution) → that value
 *   - No NAV ever recorded → costBasis − cumDist (defaults to "money still
 *     deployed at face value")
 */
const NAV_BEARING_TYPES: readonly VENTURE_EVENT_TYPE[] = [
  VENTURE_EVENT_TYPE.nav_update,
  VENTURE_EVENT_TYPE.writedown,
  VENTURE_EVENT_TYPE.exit,
  VENTURE_EVENT_TYPE.distribution,
];

export function computeCurrentValue({
  status,
  events,
  costBasis,
  cumulativeDistributions,
}: {
  status: VENTURE_DEAL_STATUS;
  events: readonly VentureEvents[];
  costBasis: string;
  cumulativeDistributions: string;
}): string {
  if (status === VENTURE_DEAL_STATUS.fully_exited || status === VENTURE_DEAL_STATUS.written_off) {
    return '0';
  }

  const navBearing = events
    .filter((e) => NAV_BEARING_TYPES.includes(e.type) && e.navAfter !== null)
    .sort((a, b) => {
      const dateCmp = a.eventDate.localeCompare(b.eventDate);
      if (dateCmp !== 0) return dateCmp;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  if (navBearing.length === 0) {
    return new Big(costBasis).minus(cumulativeDistributions).toFixed(10);
  }

  const latest = navBearing[navBearing.length - 1]!;
  return latest.navAfter!.toDecimalString(10);
}
