import { VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import VentureEvents from '@models/venture/venture-events.model';
import Big from 'big.js';

/**
 * Sum of all distribution + exit `lpNetAmount` values. Represents the
 * total cash LP has received back from the deal (after carry deduction).
 *
 * Used as the numerator of DPI and a component of TVPI.
 */
export function computeCumulativeDistributions({ events }: { events: readonly VentureEvents[] }): string {
  let total = new Big(0);
  for (const event of events) {
    if (event.type !== VENTURE_EVENT_TYPE.distribution && event.type !== VENTURE_EVENT_TYPE.exit) {
      continue;
    }
    if (event.lpNetAmount) {
      total = total.plus(event.lpNetAmount.toDecimalString(10));
    }
  }
  return total.toFixed(10);
}
