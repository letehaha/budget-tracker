import { type CounterpartyRow, getCounterpartyIban } from './transaction-metadata';

/**
 * Drops candidates whose counterparty IBAN contradicts the reference row's.
 * When the reference has an IBAN only an exact match survives – an IBAN-less
 * card pending is not the SEPA transfer that is looking for a partner. When
 * the reference has none (card purchases) nothing is filtered.
 */
export function filterIbanCompatible<T extends CounterpartyRow>({
  candidates,
  counterpartyIban,
}: {
  candidates: T[];
  counterpartyIban: string | null;
}): T[] {
  if (!counterpartyIban) return candidates;
  return candidates.filter((candidate) => getCounterpartyIban({ tx: candidate }) === counterpartyIban);
}

/**
 * Nearest-dated candidate wins, so a booked re-issue pairs with its own
 * pending row instead of a stale never-booked one that shares the amount.
 */
export function pickNearestByDate<T extends { id: string; time: Date }>({
  candidates,
  date,
}: {
  candidates: T[];
  date: Date;
}): T | null {
  const target = date.getTime();
  const sorted = [...candidates].sort((a, b) => {
    const distance = Math.abs(a.time.getTime() - target) - Math.abs(b.time.getTime() - target);
    return distance !== 0 ? distance : a.id.localeCompare(b.id);
  });

  return sorted[0] ?? null;
}
