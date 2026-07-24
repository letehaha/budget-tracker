import { toUtcDateString } from '@common/utils/date';
import { logger } from '@js/utils';
import { calculateCashDelta } from '@services/investments/transactions/cash-balance-utils';
import { format } from 'date-fns';

import type { CurrentBalanceRow, TransactionRow, TransferRow } from './types';

/**
 * Bucket signed native-currency cash deltas by `currency → yyyy-MM-dd`.
 * `calculateCashDelta` owns per-category signs for trades; transfers debit the
 * source leg and credit the destination leg (in `toCurrencyCode`/`toAmount`
 * for cross-currency rows). A cross-currency row without a positive `toAmount`
 * applies only the source debit and is logged — one bad row must not fail the
 * whole combined-history request. Same-day deltas accumulate (`+=`).
 */
export const accumulateCashDeltas = ({
  transactions,
  portfolioTransfers,
  portfolioIdSet,
}: {
  transactions: TransactionRow[];
  portfolioTransfers: TransferRow[];
  portfolioIdSet: Set<string>;
}): Map<string, Map<string, number>> => {
  const cashDeltaByCurrencyDay = new Map<string, Map<string, number>>();

  const addCashDelta = ({ cashCurrency, dateStr, delta }: { cashCurrency: string; dateStr: string; delta: number }) => {
    if (delta === 0) return;
    let byDay = cashDeltaByCurrencyDay.get(cashCurrency);
    if (!byDay) {
      byDay = new Map();
      cashDeltaByCurrencyDay.set(cashCurrency, byDay);
    }
    byDay.set(dateStr, (byDay.get(dateStr) ?? 0) + delta);
  };

  for (const tx of transactions) {
    const delta = calculateCashDelta({
      // Raw row: `settlementAmount` is already a Postgres decimal string, the
      // exact shape `calculateCashDelta` feeds into Big — no precision loss.
      settlementAmount: tx.settlementAmount,
      category: tx.category,
    });
    // `==` (not `===`) so an `undefined` escaping a future gap in
    // `calculateCashDelta` is also skipped instead of becoming NaN below.
    if (delta == null) continue;
    addCashDelta({
      cashCurrency: tx.settlementCurrencyCode,
      dateStr: toUtcDateString(tx.date),
      delta: Number(delta),
    });
  }

  for (const tr of portfolioTransfers) {
    const isCrossCurrency = tr.toCurrencyCode != null;
    const destinationLegBroken = isCrossCurrency && (tr.toAmount == null || tr.toAmount.isZero());
    if (destinationLegBroken) {
      logger.error(
        `PortfolioTransfer on ${tr.date} (from=${tr.fromPortfolioId ?? '<null>'}, to=${tr.toPortfolioId ?? '<null>'}) has toCurrencyCode=${tr.toCurrencyCode} but toAmount is null/zero. Cross-currency transfers must carry a positive toAmount. Applying the source-leg debit and skipping the destination credit.`,
      );
    }
    const amount = tr.amount.toNumber();
    if (tr.fromPortfolioId && portfolioIdSet.has(tr.fromPortfolioId)) {
      addCashDelta({ cashCurrency: tr.currencyCode, dateStr: tr.date, delta: -amount });
    }
    if (tr.toPortfolioId && portfolioIdSet.has(tr.toPortfolioId) && !destinationLegBroken) {
      addCashDelta({
        cashCurrency: isCrossCurrency ? tr.toCurrencyCode! : tr.currencyCode,
        dateStr: tr.date,
        delta: isCrossCurrency ? tr.toAmount!.toNumber() : amount,
      });
    }
  }

  return cashDeltaByCurrencyDay;
};

/**
 * Replay per-currency cash balances across the chart window, converting each
 * day's running balance to user base via `getExchangeRate` (day-of FX).
 *
 * Anchor formula `seed = stored - sum(all deltas through end-of-today)`:
 * shadow writers (importer cash seeds, the test/dev-only
 * `PUT /portfolios/:id/balance`) mutate `PortfolioBalances` without audit
 * rows, so anchoring on the stored value shifts every replayed day by the
 * same offset and the chart matches the portfolio detail page. This only
 * works when `cashDeltaByCurrencyDay` also includes deltas AFTER `maxDate`:
 * the seed subtracts them and the per-day loop (which stops at `maxDate`)
 * never re-adds them.
 */
export const computePortfolioCashByDate = ({
  cashDeltaByCurrencyDay,
  currentBalances,
  uniqueDates,
  maxDate,
  getExchangeRate,
  todayKey = format(new Date(), 'yyyy-MM-dd'),
}: {
  cashDeltaByCurrencyDay: Map<string, Map<string, number>>;
  currentBalances: CurrentBalanceRow[];
  uniqueDates: string[];
  maxDate: string;
  getExchangeRate: (currencyCode: string, dateStr: string) => number;
  /** Override for tests; defaults to the system clock. */
  todayKey?: string;
}): Map<string, number> => {
  const storedCashByCurrency = new Map<string, number>();
  for (const b of currentBalances) {
    storedCashByCurrency.set(b.currencyCode, (storedCashByCurrency.get(b.currencyCode) ?? 0) + b.totalCash.toNumber());
  }

  const totalDeltaByCurrency = new Map<string, number>();
  for (const [cashCurrency, byDay] of cashDeltaByCurrencyDay) {
    let total = 0;
    for (const delta of byDay.values()) total += delta;
    totalDeltaByCurrency.set(cashCurrency, total);
  }

  const cashInBaseByDate = new Map<string, number>();
  if (uniqueDates.length === 0) return cashInBaseByDate;

  // Iterate the union of currencies seen in deltas and stored balances so a
  // currency that only exists via direct write (no tx/transfer row) still emits cash.
  const firstDate = uniqueDates[0]!;
  const cashCurrencies = new Set<string>([...cashDeltaByCurrencyDay.keys(), ...storedCashByCurrency.keys()]);

  for (const cashCurrency of cashCurrencies) {
    const byDay = cashDeltaByCurrencyDay.get(cashCurrency);
    const seed = (storedCashByCurrency.get(cashCurrency) ?? 0) - (totalDeltaByCurrency.get(cashCurrency) ?? 0);
    let running = seed;
    if (byDay) {
      for (const [dateStr, delta] of byDay) {
        if (dateStr < firstDate) running += delta;
      }
    }
    for (const dateStr of uniqueDates) {
      if (byDay) running += byDay.get(dateStr) ?? 0;
      if (running === 0) continue;
      const rate = getExchangeRate(cashCurrency, dateStr);
      cashInBaseByDate.set(dateStr, (cashInBaseByDate.get(dateStr) ?? 0) + running * rate);
    }
  }

  // Overwrite today's cell with the stored `refTotalCash` sum, but only when
  // today is actually inside the window. A past-only window (`maxDate` before
  // today) gets no overwrite — its replayed values ARE the historical truth,
  // and today's stored cash does not belong on a historical date.
  if (todayKey >= firstDate && todayKey <= maxDate) {
    let refTotalCashSum = 0;
    for (const b of currentBalances) refTotalCashSum += b.refTotalCash.toNumber();
    cashInBaseByDate.set(todayKey, refTotalCashSum);
  }

  return cashInBaseByDate;
};
