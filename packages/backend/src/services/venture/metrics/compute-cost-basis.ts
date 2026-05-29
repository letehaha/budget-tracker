import { VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import VentureEvents from '@models/venture/venture-events.model';
import Big from 'big.js';

/**
 * Cost basis = principal + entryFee + Σ capital_calls + Σ fee_payments.
 * The deal's principal + entryFee are stored on the deal itself; cumulative
 * capital_call/fee_payment gross amounts come from the event list.
 */
export function computeCostBasis({
  dealPrincipal,
  dealEntryFee,
  events,
}: {
  dealPrincipal: string;
  dealEntryFee: string;
  events: readonly VentureEvents[];
}): string {
  let basis = new Big(dealPrincipal).plus(dealEntryFee);
  for (const event of events) {
    if (event.type === VENTURE_EVENT_TYPE.capital_call || event.type === VENTURE_EVENT_TYPE.fee_payment) {
      const gross = event.grossAmount ? new Big(event.grossAmount.toDecimalString(10)) : new Big(0);
      basis = basis.plus(gross);
    }
  }
  return basis.toFixed(10);
}
