import { Big } from 'big.js';
import { QueryInterface, QueryTypes } from 'sequelize';

/**
 * One-time repair of stored base-currency account balances after the semantics
 * change of `refCurrentBalance` / `refCreditLimit` (spot measures: native value
 * × latest rate) and `refInitialBalance` (opening balance × ledger-boundary
 * rate, for tx-backed system accounts).
 *
 * Rows written before the change carry accumulator values: refInitialBalance +
 * Σ(per-transaction refAmounts at each row's historical rate), i.e. a blend of
 * old rates. Most visibly, accounts whose native balance returned to zero kept a
 * nonzero base-currency residue. This backfill recomputes every account's ref
 * fields from its native values with the same rate-resolution rules the live
 * code now uses (per-user custom rate override when live rates are off,
 * USD-pivoted market rate otherwise, 5-dp truncated rate, banker's rounding).
 *
 * When `refInitialBalance` moves, the diff is cascaded into every `Balances`
 * history row of that account — the history table is seeded from the opening ref
 * balance, mirroring `Balances.handleAccountChange`.
 *
 * NOTES:
 * - Frozen copies of `formatRate` / banker's rounding / the USD-pivot rate math
 *   are inlined: the production image ships only `dist/` + `src/migrations`, so
 *   migrations cannot import the service layer (and must not depend on app code
 *   that may later change).
 * - Each account is repaired in its own try/catch. A failure (e.g. a currency
 *   pair with no stored rate at all) is logged and skipped rather than thrown,
 *   so one bad row cannot abort the migration — which would halt the whole
 *   deploy via the entrypoint.
 * - `down` is a no-op: the accumulator values were incorrect measurements and
 *   are not worth restoring; the write paths would immediately re-derive spot
 *   values anyway.
 */

const ACCOUNT_TYPE_SYSTEM = 'system';
const BOUNDARY_EXEMPT_CATEGORIES = new Set(['loan', 'vehicle']);
const USD = 'USD';

interface AccountRow {
  id: string;
  userId: number;
  currencyCode: string;
  type: string;
  accountCategory: string;
  currentBalance: string;
  creditLimit: string;
  initialBalance: string;
  refCurrentBalance: string;
  refCreditLimit: string;
  refInitialBalance: string;
}

/** Mirror of `formatRate` in get-exchange-rate.service.ts: truncate to 5 dp. */
function formatRate(rate: number): number {
  return Math.trunc(rate * 100000) / 100000;
}

/** Banker's rounding (round half to even) of a non-negative Big to an integer. */
function roundHalfToEvenBig(value: Big): Big {
  const floor = value.round(0, Big.roundDown);
  const fracVsHalf = value.minus(floor).cmp(new Big('0.5'));
  if (fracVsHalf < 0) return floor;
  if (fracVsHalf > 0) return floor.plus(1);
  return floor.mod(2).eq(0) ? floor : floor.plus(1);
}

/**
 * Mirror of `calculateRefAmountFromParams` (cents path): |cents| × rate with
 * banker's rounding, sign reapplied.
 */
function convertCents({ cents, rate }: { cents: string; rate: number }): string {
  const amount = new Big(cents);
  if (amount.eq(0)) return '0';
  const isNegative = amount.lt(0);
  const rounded = roundHalfToEvenBig(amount.abs().times(rate));
  return (isNegative ? rounded.neg() : rounded).toFixed(0);
}

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;

    // Per-user base currency; users without one are skipped (no ref target).
    const baseRows = await sequelize.query<{ userId: number; currencyCode: string }>(
      `SELECT "userId", "currencyCode" FROM "UsersCurrencies" WHERE "isDefaultCurrency" = true`,
      { type: QueryTypes.SELECT },
    );
    const baseByUserId = new Map(baseRows.map((row) => [row.userId, row.currencyCode]));

    // Latest market USD-pivot rate per currency (ExchangeRates stores USD-base rows).
    const usdRateRows = await sequelize.query<{ quoteCode: string; rate: number }>(
      `SELECT DISTINCT ON ("quoteCode") "quoteCode", "rate"
       FROM "ExchangeRates" WHERE "baseCode" = :usd
       ORDER BY "quoteCode", "date" DESC`,
      { replacements: { usd: USD }, type: QueryTypes.SELECT },
    );
    const latestUsdRate = new Map(usdRateRows.map((row) => [row.quoteCode, Number(row.rate)]));

    // Per-user custom rates apply only when the user turned live rates off for
    // the account's currency AND the quote is their base currency — the same
    // gate `getExchangeRate` applies.
    const liveRateRows = await sequelize.query<{ userId: number; currencyCode: string; liveRateUpdate: boolean }>(
      `SELECT "userId", "currencyCode", "liveRateUpdate" FROM "UsersCurrencies"`,
      { type: QueryTypes.SELECT },
    );
    const liveRateOff = new Set(
      liveRateRows.filter((row) => row.liveRateUpdate === false).map((row) => `${row.userId}:${row.currencyCode}`),
    );
    const customRateRows = await sequelize.query<{ userId: number; baseCode: string; quoteCode: string; rate: number }>(
      `SELECT DISTINCT ON ("userId", "baseCode", "quoteCode") "userId", "baseCode", "quoteCode", "rate"
       FROM "UserExchangeRates"
       ORDER BY "userId", "baseCode", "quoteCode", "date" DESC`,
      { type: QueryTypes.SELECT },
    );
    const customRate = new Map(
      customRateRows.map((row) => [`${row.userId}:${row.baseCode}:${row.quoteCode}`, Number(row.rate)]),
    );

    /** Historical USD-pivot leg: latest row on/before the date, else earliest after. */
    const usdRateAt = async ({ code, date }: { code: string; date: Date }): Promise<number> => {
      if (code === USD) return 1;
      const before = await sequelize.query<{ rate: number }>(
        `SELECT "rate" FROM "ExchangeRates"
         WHERE "baseCode" = :usd AND "quoteCode" = :code AND "date" < :dayEnd
         ORDER BY "date" DESC LIMIT 1`,
        {
          replacements: { usd: USD, code, dayEnd: new Date(new Date(date).setUTCHours(23, 59, 59, 999)) },
          type: QueryTypes.SELECT,
        },
      );
      if (before[0]) return Number(before[0].rate);
      const after = await sequelize.query<{ rate: number }>(
        `SELECT "rate" FROM "ExchangeRates"
         WHERE "baseCode" = :usd AND "quoteCode" = :code
         ORDER BY "date" ASC LIMIT 1`,
        { replacements: { usd: USD, code }, type: QueryTypes.SELECT },
      );
      if (after[0]) return Number(after[0].rate);
      throw new Error(`No stored rate for ${code} on any date`);
    };

    const resolveRate = ({
      userId,
      fromCode,
      toCode,
      usdRateOf,
    }: {
      userId: number;
      fromCode: string;
      toCode: string;
      usdRateOf: (code: string) => number;
    }): number => {
      if (fromCode === toCode) return 1;
      if (liveRateOff.has(`${userId}:${fromCode}`)) {
        const custom = customRate.get(`${userId}:${fromCode}:${toCode}`);
        if (custom !== undefined) return formatRate(custom);
      }
      const fromUsd = usdRateOf(fromCode);
      const toUsd = usdRateOf(toCode);
      return formatRate(toUsd / fromUsd);
    };

    const accounts = await sequelize.query<AccountRow>(
      `SELECT "id", "userId", "currencyCode", "type", "accountCategory",
              "currentBalance", "creditLimit", "initialBalance",
              "refCurrentBalance", "refCreditLimit", "refInitialBalance"
       FROM "Accounts"`,
      { type: QueryTypes.SELECT },
    );

    let updated = 0;
    let unchanged = 0;
    const failedAccounts: string[] = [];

    for (const account of accounts) {
      try {
        const baseCode = baseByUserId.get(account.userId);
        if (!baseCode) {
          throw new Error(`user ${account.userId} has no base currency`);
        }

        const latestUsdRateOf = (code: string): number => {
          if (code === USD) return 1;
          const rate = latestUsdRate.get(code);
          if (rate === undefined) throw new Error(`no latest USD rate for ${code}`);
          return rate;
        };

        const spotRate = resolveRate({
          userId: account.userId,
          fromCode: account.currencyCode,
          toCode: baseCode,
          usdRateOf: latestUsdRateOf,
        });

        const newRefCurrentBalance = convertCents({ cents: account.currentBalance, rate: spotRate });
        const newRefCreditLimit = convertCents({ cents: account.creditLimit, rate: spotRate });

        // Ledger-boundary restamp of the opening balance for tx-backed system
        // accounts; others keep their existing stamp (provider snapshot / loan
        // anchor / vehicle purchase value).
        let newRefInitialBalance = account.refInitialBalance;
        if (account.type === ACCOUNT_TYPE_SYSTEM && !BOUNDARY_EXEMPT_CATEGORIES.has(account.accountCategory)) {
          const boundaryRows = await sequelize.query<{ earliestTime: Date | null }>(
            `SELECT MIN("time") AS "earliestTime" FROM "Transactions" WHERE "accountId" = :accountId`,
            { replacements: { accountId: account.id }, type: QueryTypes.SELECT },
          );
          const earliestTime = boundaryRows[0]?.earliestTime;

          let boundaryRate = spotRate;
          if (earliestTime && account.currencyCode !== baseCode) {
            // Custom rates are date-less and win over market history, matching
            // the live resolution order.
            const custom = liveRateOff.has(`${account.userId}:${account.currencyCode}`)
              ? customRate.get(`${account.userId}:${account.currencyCode}:${baseCode}`)
              : undefined;
            if (custom !== undefined) {
              boundaryRate = formatRate(custom);
            } else {
              const boundaryDate = new Date(earliestTime);
              const fromUsd = await usdRateAt({ code: account.currencyCode, date: boundaryDate });
              const toUsd = await usdRateAt({ code: baseCode, date: boundaryDate });
              boundaryRate = formatRate(toUsd / fromUsd);
            }
          }
          newRefInitialBalance = convertCents({ cents: account.initialBalance, rate: boundaryRate });
        }

        const refInitialDiff = new Big(newRefInitialBalance).minus(new Big(account.refInitialBalance));

        const changed =
          newRefCurrentBalance !== new Big(account.refCurrentBalance).toFixed(0) ||
          newRefCreditLimit !== new Big(account.refCreditLimit).toFixed(0) ||
          !refInitialDiff.eq(0);
        if (!changed) {
          unchanged += 1;
          continue;
        }

        await sequelize.query(
          `UPDATE "Accounts"
           SET "refCurrentBalance" = :refCurrentBalance,
               "refCreditLimit" = :refCreditLimit,
               "refInitialBalance" = :refInitialBalance
           WHERE "id" = :id`,
          {
            replacements: {
              refCurrentBalance: newRefCurrentBalance,
              refCreditLimit: newRefCreditLimit,
              refInitialBalance: newRefInitialBalance,
              id: account.id,
            },
            type: QueryTypes.UPDATE,
          },
        );

        // The Balances history is seeded from refInitialBalance; a moved opening
        // stamp re-baselines every row (mirror of Balances.handleAccountChange).
        if (!refInitialDiff.eq(0)) {
          await sequelize.query(
            `UPDATE "Balances"
             SET "amount" = "amount" + :diff, "updatedAt" = NOW()
             WHERE "accountId" = :accountId`,
            {
              replacements: { diff: refInitialDiff.toFixed(0), accountId: account.id },
              type: QueryTypes.UPDATE,
            },
          );
        }

        updated += 1;
      } catch (error) {
        failedAccounts.push(account.id);
        if (process.env.NODE_ENV !== 'test') {
          console.error(`Failed to remeasure ref balances for account ${account.id}:`, error);
        }
      }
    }

    if (process.env.NODE_ENV !== 'test') {
      if (failedAccounts.length > 0) {
        // Loud + greppable: these accounts still carry accumulator-era ref values
        // and the migration is marked applied regardless — surface them as one
        // block so they can be retargeted (the daily rate-sync remeasure will
        // also self-heal refCurrentBalance/refCreditLimit once a rate exists).
        console.error(
          `Ref balance remeasure: ${updated} updated, ${unchanged} unchanged, ${failedAccounts.length} FAILED. ` +
            `Accumulator values remain on account ids: ${failedAccounts.join(', ')}`,
        );
      } else {
        console.log(`Ref balance remeasure complete: ${updated} updated, ${unchanged} unchanged, 0 failed`);
      }
    }
  },

  down: async (): Promise<void> => {
    // No-op: the accumulator-era values were incorrect measurements; the live
    // write paths re-derive spot values on every balance-affecting write anyway.
  },
};
