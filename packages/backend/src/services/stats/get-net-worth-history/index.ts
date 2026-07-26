import { ACCOUNT_CATEGORIES, type Cents, asCents, endpointsTypes } from '@bt/shared/types';
import { t } from '@i18n/index';
import { UnexpectedError, ValidationError } from '@js/errors';
import { logger } from '@js/utils';
import Accounts from '@models/accounts.model';
import UsersCurrencies from '@models/users-currencies.model';
import { withTransaction } from '@services/common/with-transaction';
import { calculateVehiclesBalanceHistory } from '@services/stats/calculate-vehicles-balance-history';
import { calculateVentureBalanceHistory } from '@services/stats/calculate-venture-balance-history';
import { getAggregatedBalanceHistory, getPerAccountBalanceHistory } from '@services/stats/get-balance-history';
import { generatePeriodBuckets } from '@services/stats/utils';
import { format } from 'date-fns';

import { buildDenseDateRange } from '../get-net-worth-drivers/date-range';
import { assembleNetWorthPoint } from './assemble-point';
import { calculatePortfolioValueByDate } from './portfolio-value';
import type { NetWorthHistoryResultCents } from './types';

export type { NetWorthHistoryResultCents } from './types';

// `getAggregatedBalanceHistory` keys each day by `format(new Date(dateStr), 'yyyy-MM-dd')`
// — a `yyyy-MM-dd` string parsed as UTC midnight, then re-formatted in server-local time.
// Snapshot calendar strings must pass through the identical transform to line up under a
// negative-offset server timezone; without it the lookup shifts a calendar day and every
// account partition silently reads as zero.
const toAccountsDateKey = (dayStr: string): string => format(new Date(dayStr), 'yyyy-MM-dd');

/**
 * Balance at each snapshot date for one account partition. A missing snapshot key
 * on a NON-empty history is a key-derivation bug, not a zero balance —
 * `getAggregatedBalanceHistory` fills every day in its range — so it fails loud
 * instead of letting `?? 0` silently drop the partition. An empty history (no
 * accounts in the partition) is a real zero.
 */
const buildPartitionResolver = ({
  history,
  partition,
  userId,
}: {
  history: { date: string; amount: number }[];
  partition: string;
  userId: number;
}): ((snapshotDate: string) => Cents) => {
  const centsByDate = new Map(history.map((item) => [item.date, asCents(item.amount)]));

  return (snapshotDate: string): Cents => {
    const cents = centsByDate.get(toAccountsDateKey(snapshotDate));
    if (cents !== undefined) return cents;
    if (history.length === 0) return asCents(0);

    logger.error('Net-worth history: balance partition missing a snapshot day', {
      userId,
      partition,
      snapshotDate,
      accountsDateKey: toAccountsDateKey(snapshotDate),
    });
    throw new UnexpectedError({
      message: `Net-worth history: ${partition} balance history is missing a snapshot day.`,
    });
  };
};

/**
 * Split one per-account balance series at a snapshot date by balance sign:
 * accounts currently owing (negative) sum into `owedCents`, accounts holding the
 * user's own funds (positive) into `surplusCents`. Used for every account class
 * that can sit on either side of zero — cards, overdrafts and plain deposit
 * accounts alike — so an overdrawn account counts as debt, not a negative asset.
 * A missing snapshot key on a present account is a key-derivation bug — the series
 * fills every day of its range — so it fails loud rather than zeroing the account.
 */
const splitSeriesBySign = ({
  series,
  snapshotDate,
  partition,
  userId,
}: {
  series: Record<string, Record<string, number>>;
  snapshotDate: string;
  partition: string;
  userId: number;
}): { owedCents: Cents; surplusCents: Cents } => {
  const dateKey = toAccountsDateKey(snapshotDate);
  let owed = 0;
  let surplus = 0;

  for (const [accountId, centsByDate] of Object.entries(series)) {
    const cents = centsByDate[dateKey];
    if (cents === undefined) {
      logger.error('Net-worth history: per-account series missing a snapshot day', {
        userId,
        partition,
        accountId,
        snapshotDate,
        accountsDateKey: dateKey,
      });
      throw new UnexpectedError({
        message: `Net-worth history: ${partition} account series is missing a snapshot day.`,
      });
    }
    if (cents < 0) owed += cents;
    else surplus += cents;
  }

  return { owedCents: asCents(owed), surplusCents: asCents(surplus) };
};

/**
 * Value for one non-account asset class (vehicles, portfolios, ventures) at a
 * snapshot date. `map` is null when the user has nothing in that asset class —
 * a real zero. When `map` is present but missing `dateStr`, that's a
 * key-derivation bug — the calculator fills every requested date — so it fails
 * loud instead of letting `?? 0` silently drop the asset class.
 */
const readAssetValue = <T extends number>({
  map,
  dateStr,
  label,
  userId,
}: {
  map: Map<string, T> | null;
  dateStr: string;
  label: string;
  userId: number;
}): number => {
  if (map === null) return 0;

  const value = map.get(dateStr);
  if (value !== undefined) return value;

  logger.error('Net-worth history: asset value map missing a snapshot day', { userId, label, dateStr });
  throw new UnexpectedError({
    message: `Net-worth history: ${label} value map is missing a snapshot day.`,
  });
};

/**
 * Assemble the `degraded` payload from the portfolio valuation's two independent
 * data-quality failures, or `undefined` when neither fired. The wire contract
 * forbids an empty object: a truthiness check on `degraded` alone decides whether
 * the client renders a warning, so each inner field is set only when non-empty and
 * the whole object is dropped when both are.
 */
const buildDegraded = ({
  unpricedSecurities,
  fxFallbackCurrencies,
}: {
  unpricedSecurities: endpointsTypes.NetWorthHistoryUnpricedSecurity[];
  fxFallbackCurrencies: string[];
}): endpointsTypes.NetWorthHistoryDegraded | undefined => {
  const degraded: endpointsTypes.NetWorthHistoryDegraded = {};
  if (unpricedSecurities.length > 0) degraded.unpricedSecurities = unpricedSecurities;
  if (fxFallbackCurrencies.length > 0) degraded.fxFallbackCurrencies = fxFallbackCurrencies;

  return degraded.unpricedSecurities || degraded.fxFallbackCurrencies ? degraded : undefined;
};

/**
 * Assets/liabilities/net-worth series: one end-of-bucket balance snapshot per
 * granularity bucket over [from, to], the last bucket clamped to `to`. Assets =
 * every non-liability account plus portfolios (holdings + uninvested cash),
 * ventures and vehicles. Every account that can cross zero — cards, overdrafts
 * and plain deposit accounts — is classified per account by balance sign at each
 * snapshot: an owing (negative) balance sums into a liability kind, while a
 * positive balance counts as assets. An overdrawn deposit account has no liability
 * category of its own, so its owed balance joins the overdraft kind. Loans are
 * always liabilities at their whole signed value. All amounts are base-currency
 * cents; the serializer converts to decimals.
 *
 * The `includeCreditLimitInStats` setting is deliberately ignored: net worth
 * reflects actual balances, and available credit is not debt.
 */
export const getNetWorthHistory = async ({
  userId,
  from,
  to,
  granularity,
}: {
  userId: number;
  from: string;
  to: string;
  granularity: endpointsTypes.NetWorthHistoryGranularity;
}): Promise<NetWorthHistoryResultCents> => {
  // Weekly buckets follow ISO weeks (Monday start) — the shared spec every stats
  // report uses, so week edges line up across the analytics pages.
  const buckets = generatePeriodBuckets({ from, to, granularity });

  if (buckets.length === 0) {
    return { points: [] };
  }

  // Past this cap the chart is unreadable anyway and a fine-grained all-time range
  // would price holdings on thousands of days — the client should pick a coarser
  // granularity instead.
  if (buckets.length > endpointsTypes.MAX_NET_WORTH_HISTORY_BUCKETS) {
    throw new ValidationError({
      message: t({ key: 'stats.netWorthHistoryTooManyPoints' }),
      details: { maxPoints: endpointsTypes.MAX_NET_WORTH_HISTORY_BUCKETS, requestedPoints: buckets.length },
    });
  }

  // Holdings are valued on these days only (the boundary-dates optimization) —
  // never per calendar day, which is what keeps an all-time range affordable.
  const snapshotDates = buckets.map((bucket) => format(bucket.periodEnd, 'yyyy-MM-dd'));
  // The portfolio cash replay only adds deltas landing exactly on a listed day,
  // so it gets every day between the first and last snapshot.
  const denseDates = buildDenseDateRange({ boundaryDates: snapshotDates });

  const minDate = snapshotDates[0]!;
  const maxDate = snapshotDates[snapshotDates.length - 1]!;

  // The account partitions span the full requested range, not just the snapshot
  // span: a Balances row dated between `from` and the first bucket end must anchor
  // the first snapshot instead of letting a later row back-fill over it.
  const accountsRange = { from, to: maxDate };

  // One read transaction pins a single Postgres connection across the fan-out
  // below, rather than each branch checking out its own and a burst of report
  // loads draining the pool.
  const [
    assetAccountsSeries,
    creditCardSeries,
    overdraftSeries,
    loanHistory,
    vehicleValuesByDate,
    portfolioValuation,
    ventureValuesByDate,
  ] = await withTransaction(async () => {
    // Shared by every sub-calculator that converts to base currency — fetch once.
    const userBaseCurrencyPromise = UsersCurrencies.findOne({
      where: { userId, isDefaultCurrency: true },
      raw: true,
      attributes: ['currencyCode'],
    }) as Promise<Pick<UsersCurrencies, 'currencyCode'> | null>;

    // Each partition is a separate filtered aggregation so it keeps its own
    // forward-fill (a loan anchor date must not forward-fill into the cash series).
    return Promise.all([
      // Per-account (not pre-summed) so the sign split is per account: one deposit
      // account overdrawn −500 and another holding +300 on the same day land on
      // opposite sides of the split, rather than netting to a single +/−200 figure.
      // Vehicles are excluded here because they enter assets through their own
      // depreciation series below, not through Balances rows; the liability kinds
      // are excluded because cards/overdrafts/loans get their own series.
      getPerAccountBalanceHistory({
        userId,
        ...accountsRange,
        categoryFilter: { exclude: [ACCOUNT_CATEGORIES.vehicle, ...endpointsTypes.NET_WORTH_LIABILITY_KINDS] },
      }),
      // Per-account (not pre-summed) series: the sign classification is per
      // account, so one card owing −500 and another holding +300 on the same day
      // must land on opposite sides of the split.
      getPerAccountBalanceHistory({
        userId,
        ...accountsRange,
        categoryFilter: { only: [ACCOUNT_CATEGORIES.creditCard] },
      }),
      getPerAccountBalanceHistory({
        userId,
        ...accountsRange,
        categoryFilter: { only: [ACCOUNT_CATEGORIES.overdraft] },
      }),
      (async () => {
        // Back-fill each loan's pre-anchor days from its opening balance
        // (`refInitialBalance` — the outstanding as-of the anchor date) rather than
        // from the anchor-day Balances row. A payment only ever writes
        // `currentBalance`, so the opening is immutable; this stops a payoff dated
        // on the anchor day (which folds the anchor row toward zero) from
        // retroactively rewriting the loan balance shown on earlier days.
        const loanAccounts = await Accounts.findAll({
          where: { userId, accountCategory: ACCOUNT_CATEGORIES.loan, excludeFromStats: false },
          attributes: ['id', 'refInitialBalance'],
        });
        const openingCentsByAccount = new Map(loanAccounts.map((a) => [a.id, a.refInitialBalance.toCents()]));

        return getAggregatedBalanceHistory({
          userId,
          ...accountsRange,
          categoryFilter: { only: [ACCOUNT_CATEGORIES.loan] },
          openingCentsByAccount,
        });
      })(),
      calculateVehiclesBalanceHistory({ userId, maxDate, uniqueDates: snapshotDates, userBaseCurrencyPromise }),
      calculatePortfolioValueByDate({ userId, snapshotDates, denseDates, userBaseCurrencyPromise }),
      calculateVentureBalanceHistory({ userId, minDate, maxDate, uniqueDates: snapshotDates, userBaseCurrencyPromise }),
    ]);
  })();

  const resolveLoan = buildPartitionResolver({ history: loanHistory, partition: ACCOUNT_CATEGORIES.loan, userId });

  // A user with no data still gets one all-zero point per bucket — the chart
  // renders a flat zero line for the requested range rather than an empty state.
  // The per-account sign split, loan resolution and asset-class valuation happen
  // here (they need the fetched series); the folding into kinds is `assembleNetWorthPoint`.
  const points = snapshotDates.map((dateStr) =>
    assembleNetWorthPoint({
      date: dateStr,
      assetAccounts: splitSeriesBySign({
        series: assetAccountsSeries,
        snapshotDate: dateStr,
        partition: 'asset-accounts',
        userId,
      }),
      creditCard: splitSeriesBySign({
        series: creditCardSeries,
        snapshotDate: dateStr,
        partition: ACCOUNT_CATEGORIES.creditCard,
        userId,
      }),
      overdraft: splitSeriesBySign({
        series: overdraftSeries,
        snapshotDate: dateStr,
        partition: ACCOUNT_CATEGORIES.overdraft,
        userId,
      }),
      loanCents: resolveLoan(dateStr),
      portfolioCents: asCents(
        readAssetValue({ map: portfolioValuation.valuesByDate, dateStr, label: 'portfolio', userId }),
      ),
      vehicleCents: asCents(readAssetValue({ map: vehicleValuesByDate, dateStr, label: 'vehicle', userId })),
      ventureCents: asCents(readAssetValue({ map: ventureValuesByDate, dateStr, label: 'venture', userId })),
    }),
  );

  return {
    points,
    degraded: buildDegraded({
      unpricedSecurities: portfolioValuation.unpricedSecurities,
      fxFallbackCurrencies: portfolioValuation.fxFallbackCurrencies,
    }),
  };
};
