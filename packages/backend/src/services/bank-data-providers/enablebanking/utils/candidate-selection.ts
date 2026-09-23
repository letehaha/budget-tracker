import { IBAN_LESS_FALLBACK_WINDOW_DAYS, MS_PER_DAY } from './constants';
import { type CounterpartyRow, getCounterpartyIban } from './transaction-metadata';

/**
 * Drops candidates whose counterparty IBAN contradicts the reference row's.
 * When the reference has an IBAN, exact matches win; without any, IBAN-less
 * candidates dated within IBAN_LESS_FALLBACK_WINDOW_DAYS of `date` survive,
 * since ASPSPs often omit the counterparty on the pending payload and fill it
 * at booking. A different IBAN never survives. When the reference has none
 * (card purchases) nothing is filtered.
 */
export function filterIbanCompatible<T extends CounterpartyRow & { time: Date }>({
  candidates,
  counterpartyIban,
  date,
}: {
  candidates: T[];
  counterpartyIban: string | null;
  date: Date;
}): T[] {
  if (!counterpartyIban) return candidates;
  const matches = candidates.filter((candidate) => getCounterpartyIban({ tx: candidate }) === counterpartyIban);
  if (matches.length > 0) return matches;
  return candidates.filter(
    (candidate) =>
      getCounterpartyIban({ tx: candidate }) === null &&
      Math.abs(candidate.time.getTime() - date.getTime()) <= IBAN_LESS_FALLBACK_WINDOW_DAYS * MS_PER_DAY,
  );
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
