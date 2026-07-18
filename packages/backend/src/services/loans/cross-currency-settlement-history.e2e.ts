import { TRANSACTION_TRANSFER_NATURE, type RecordId } from '@bt/shared/types';
import { afterEach, describe, expect, it } from '@jest/globals';
import { connection } from '@models/index';
import * as helpers from '@tests/helpers';
import { format, startOfDay, subDays } from 'date-fns';

/**
 * A cross-currency loan's account card and its net-worth chart must agree on the
 * base-currency (ref) outstanding once FX rates move.
 *
 * The card's `refCurrentBalance` is a SPOT measure — the floored native
 * outstanding × the latest rate (see `recompute-loan-balance.service`). The
 * chart (the loan's `Balances` history, read here through
 * `/stats/balance-history?accountId=`) is instead rebuilt as an ACCUMULATOR:
 * `refInitialBalance + Σ(each payment leg's refAmount)`, where every leg's
 * refAmount was stamped at that payment's own historical rate. When those rates
 * diverge from the anchor rate the accumulator carries an FX residue after the
 * native balance settles, so the chart disagrees with the card. Loans opt out of
 * the today-row spot pin (`Balances.setTodayRowToSpot` no-ops for loans), so
 * nothing reconciles the chart back to the spot value.
 */

// Distinct calendar days: anchor well before both payments, payments on days
// with different seeded USD→AED rates so the leg refAmounts diverge.
const dayObj = (n: number) => subDays(startOfDay(new Date()), n);
const ANCHOR_DATE = dayObj(40);
const PAY_1_DATE = dayObj(25);
const PAY_2_DATE = dayObj(15);
const ANCHOR_KEY = format(ANCHOR_DATE, 'yyyy-MM-dd');
const PAY_1_KEY = format(PAY_1_DATE, 'yyyy-MM-dd');
const PAY_2_KEY = format(PAY_2_DATE, 'yyyy-MM-dd');

// Rate on each payment day. Payment 1 lands high, payment 2 lands low; averaged
// against the anchor rate (today's spot, which stamps the loan's
// refInitialBalance on re-anchor) they can't net back to zero in the base
// currency even though the native amounts do.
const PAY_1_USD_TO_AED = 5.0;
const PAY_2_USD_TO_AED = 2.0;

/** Seeds an exact USD→AED rate for a historical day so a backdated payment's refAmount uses it. */
const seedUsdAedRate = async ({ date, rate }: { date: Date; rate: number }) => {
  await connection.sequelize.query(
    `DELETE FROM "ExchangeRates" WHERE "baseCode" = 'USD' AND "quoteCode" = 'AED' AND date = :date`,
    { replacements: { date } },
  );
  await connection.sequelize.query(
    `INSERT INTO "ExchangeRates" ("baseCode", "quoteCode", "date", "rate", "source")
     VALUES ('USD', 'AED', :date, :rate, 'api-layer')`,
    { replacements: { date, rate } },
  );
};

/** Re-anchors `loan` to the given outstanding as-of a past date (moves balanceAnchorDate). */
const reAnchorLoan = async ({ loanId, balance, asOf }: { loanId: string; balance: number; asOf: string }) =>
  helpers.updateLoan({
    id: loanId,
    payload: { currentBalance: balance, currentBalanceAsOf: asOf },
    raw: true,
  });

/** Records a `transfer_to_loan` payment of `amount` into the loan on `time`. Returns the source expense leg. */
const payLoan = async ({
  loanId,
  sourceAccountId,
  amount,
  time,
}: {
  loanId: string;
  sourceAccountId: RecordId;
  amount: number;
  time: string;
}) => {
  const [base] = await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({ accountId: sourceAccountId, amount, time }),
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
      destinationAmount: amount,
      destinationAccountId: loanId as RecordId,
    },
    raw: true,
  });
  return base;
};

/** The loan's base-currency (ref) net-worth chart via the balance-history endpoint, normalized to `{ date, amount }`. */
const getLoanRefHistory = async ({ loanId }: { loanId: string }) => {
  const rows = await helpers.getBalanceHistory({ accountId: loanId, raw: true });
  return rows.map((row) => ({
    date: format(new Date(row.date), 'yyyy-MM-dd'),
    amount: Number(row.amount),
  }));
};

describe('Cross-currency loan settlement: chart matches the card', () => {
  afterEach(async () => {
    // ExchangeRates is a seed table (not truncated between tests) and the global
    // beforeEach only clears today+future rows — drop this file's historical
    // fixtures so they can't leak into other tests on the same worker.
    await connection.sequelize.query(
      `DELETE FROM "ExchangeRates" WHERE "baseCode" = 'USD' AND "quoteCode" = 'AED' AND date IN (:pay1, :pay2)`,
      { replacements: { pay1: PAY_1_DATE, pay2: PAY_2_DATE } },
    );
  });

  it("settles the loan's net-worth chart to zero when the native outstanding reaches zero across diverging FX rates", async () => {
    // USD source cash account under the AED test base currency (also registers USD
    // as a user currency so the USD loan can be created).
    const { account: sourceAccount } = await helpers.createAccountWithNewCurrency({ currency: 'USD' });

    // USD loan owing $1200. Both `initialBalance` and `originalPrincipal` are the
    // full outstanding so paying it down twice by $600 settles it exactly.
    const loan = await helpers.createLoan({
      payload: helpers.buildCreateLoanPayload({
        currencyCode: 'USD',
        initialBalance: 1_200,
        originalPrincipal: 1_200,
      }),
      raw: true,
    });

    await seedUsdAedRate({ date: PAY_1_DATE, rate: PAY_1_USD_TO_AED });
    await seedUsdAedRate({ date: PAY_2_DATE, rate: PAY_2_USD_TO_AED });

    // Move the anchor 40 days back with the full $1200 still owed, so both later
    // payments count as post-anchor and land on days with distinct FX rates.
    await reAnchorLoan({ loanId: loan.id, balance: 1_200, asOf: ANCHOR_KEY });

    // $600 at USD→AED = 5.0 → leg refAmount = 3000 AED.
    await payLoan({
      loanId: loan.id,
      sourceAccountId: sourceAccount.id as RecordId,
      amount: 600,
      time: PAY_1_DATE.toISOString(),
    });
    // $600 at USD→AED = 2.0 → leg refAmount = 1200 AED. Native now fully settled.
    await payLoan({
      loanId: loan.id,
      sourceAccountId: sourceAccount.id as RecordId,
      amount: 600,
      time: PAY_2_DATE.toISOString(),
    });

    const reloaded = await helpers.getLoanById({ id: loan.id, raw: true });

    // Native outstanding is exactly zero: -1200 + 600 + 600 = 0.
    expect(reloaded.currentBalance).toBe(0);
    // The account card's ref balance is the spot measure of a zero native
    // outstanding — exactly zero. (Already correct today.)
    expect(reloaded.refCurrentBalance).toBe(0);

    const refHistory = await getLoanRefHistory({ loanId: loan.id });

    // The chart must read zero in the base currency at the settlement-dated row:
    // $0 owed is 0 owed regardless of currency. The accumulator instead carries
    // an FX residue — refInitialBalance (opening stamped at today's spot rate)
    // plus the two historical-rate legs (3000 + 1200 AED) don't net to zero.
    const settlementRow = refHistory.find((row) => row.date === PAY_2_KEY);
    expect(settlementRow).toBeDefined();
    expect(settlementRow!.amount).toBe(0);

    // …and at the latest/current point, which must equal the account card's spot
    // refCurrentBalance (also zero) for a settled loan.
    const latestRow = refHistory[refHistory.length - 1];
    expect(latestRow!.date).toBe(PAY_2_KEY);
    expect(latestRow!.amount).toBe(0);
    expect(latestRow!.amount).toBe(reloaded.refCurrentBalance);
  });
});
