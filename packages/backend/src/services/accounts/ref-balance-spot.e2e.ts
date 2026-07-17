import { TRANSACTION_TYPES } from '@bt/shared/types';
import { afterEach, describe, expect, it } from '@jest/globals';
import { connection } from '@models/index';
import * as helpers from '@tests/helpers';
import { AED_PER_USD, EUR_PER_USD } from '@tests/mocks/exchange-rates/data';
import { startOfDay, subDays } from 'date-fns';

/**
 * `refCurrentBalance` is a SPOT measure: the account's native balance converted
 * at the latest exchange rate. Transaction `refAmount`s keep their historical
 * tx-date rates (flows); the account-level ref balance must not accumulate them
 * (stock). These tests pin both sides of that split, plus the two re-anchoring
 * triggers: the daily rate sync and custom-rate edits.
 */

// A fixed historical date with its own exact rates for BOTH cross-rate legs, so
// historical tx conversions use a rate very different from the mocked "today"
// basket (EUR→AED: 7.0 historical vs ~3.87 today).
const HISTORICAL_DATE = subDays(startOfDay(new Date()), 5);
const HISTORICAL_EUR_PER_USD = 0.5;
const HISTORICAL_AED_PER_USD = 3.5;
const HISTORICAL_EUR_TO_AED = HISTORICAL_AED_PER_USD / HISTORICAL_EUR_PER_USD; // 7.0
const SPOT_EUR_TO_AED = AED_PER_USD / EUR_PER_USD; // ~3.86883

const seedHistoricalRates = async () => {
  await connection.sequelize.query(
    `INSERT INTO "ExchangeRates" ("baseCode", "quoteCode", "date", "rate", "source")
     VALUES ('USD', 'EUR', :date, :eurRate, 'api-layer'), ('USD', 'AED', :date, :aedRate, 'api-layer')`,
    {
      replacements: { date: HISTORICAL_DATE, eurRate: HISTORICAL_EUR_PER_USD, aedRate: HISTORICAL_AED_PER_USD },
    },
  );
};

// API responses serialize Money as decimals; assertions compare cents so the
// `toEqualRefValue` matcher's banker's rounding + ±1 tolerance applies cleanly.
const decimalToCents = (decimal: unknown) => Math.round(Number(decimal) * 100);

const createEurAccount = async () => {
  await helpers.addUserCurrencies({ currencyCodes: ['EUR'] });
  return helpers.createAccount({
    payload: helpers.buildAccountPayload({ currencyCode: 'EUR' }),
    raw: true,
  });
};

describe('Account ref balances are spot measures', () => {
  afterEach(async () => {
    // ExchangeRates is a seed table (not truncated between tests) and the global
    // beforeEach only clears today+future rows — drop this file's historical
    // fixture rows so they can't leak into other tests on the same worker.
    await connection.sequelize.query(`DELETE FROM "ExchangeRates" WHERE date = :date`, {
      replacements: { date: HISTORICAL_DATE },
    });
  });

  it('converts refCurrentBalance at the latest rate while the tx refAmount keeps its historical rate', async () => {
    const account = await createEurAccount();
    await seedHistoricalRates();

    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.income,
        time: HISTORICAL_DATE.toISOString(),
      }),
      raw: true,
    });

    // The flow keeps its historical tx-date rate…
    expect(decimalToCents(Number(tx.refAmount))).toEqualRefValue(10000 * HISTORICAL_EUR_TO_AED);

    // …while the stock is measured at the latest rate.
    const updated = await helpers.getAccount({ id: account.id, raw: true });
    expect(Number(updated.currentBalance)).toBe(100);
    expect(decimalToCents(updated.refCurrentBalance)).toEqualRefValue(10000 * SPOT_EUR_TO_AED);
  });

  it('returns refCurrentBalance to exactly zero when the native balance nets to zero across rate changes', async () => {
    const account = await createEurAccount();
    await seedHistoricalRates();

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.income,
        time: HISTORICAL_DATE.toISOString(),
      }),
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
        time: startOfDay(new Date()).toISOString(),
      }),
      raw: true,
    });

    // Money in at 7.0, out at ~3.87 — an accumulator would keep a large base-currency
    // residue here; the spot measure of a zero balance is exactly zero.
    const updated = await helpers.getAccount({ id: account.id, raw: true });
    expect(Number(updated.currentBalance)).toBe(0);
    expect(Number(updated.refCurrentBalance)).toBe(0);
  });

  it('remeasures stored ref balances when the rate sync runs', async () => {
    const account = await createEurAccount();

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    const beforeSync = await helpers.getAccount({ id: account.id, raw: true });
    expect(decimalToCents(beforeSync.refCurrentBalance)).toEqualRefValue(10000 * SPOT_EUR_TO_AED);

    // Overnight rate move: EUR weakens against USD in the stored basket. The
    // stored balance must NOT react on its own — only the sync's remeasure pass
    // re-anchors it.
    const newEurPerUsd = 0.75;
    await connection.sequelize.query(
      `UPDATE "ExchangeRates" SET rate = :rate
       WHERE "baseCode" = 'USD' AND "quoteCode" = 'EUR' AND date >= :today`,
      { replacements: { rate: newEurPerUsd, today: startOfDay(new Date()) } },
    );

    const stillStale = await helpers.getAccount({ id: account.id, raw: true });
    expect(decimalToCents(stillStale.refCurrentBalance)).toEqualRefValue(10000 * SPOT_EUR_TO_AED);

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toBe(200);

    const remeasured = await helpers.getAccount({ id: account.id, raw: true });
    expect(decimalToCents(remeasured.refCurrentBalance)).toEqualRefValue(10000 * (AED_PER_USD / newEurPerUsd));
  });

  it('remeasures the user balances immediately after a custom rate is set', async () => {
    const account = await createEurAccount();

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    await helpers.updateUserCurrency({
      currency: { currencyCode: 'EUR', liveRateUpdate: false },
      raw: true,
    });
    const res = await helpers.editCurrencyExchangeRate({
      pairs: [
        { baseCode: 'EUR', quoteCode: 'AED', rate: 5 },
        { baseCode: 'AED', quoteCode: 'EUR', rate: 0.2 },
      ],
    });
    expect(res.statusCode).toBe(200);

    const remeasured = await helpers.getAccount({ id: account.id, raw: true });
    expect(Number(remeasured.refCurrentBalance)).toBe(500);
  });

  it('keeps ref balances identical to native balances for base-currency accounts', async () => {
    const account = await helpers.createAccount({ raw: true });

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 123.45,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    const updated = await helpers.getAccount({ id: account.id, raw: true });
    expect(Number(updated.currentBalance)).toBe(123.45);
    expect(Number(updated.refCurrentBalance)).toBe(123.45);
  });
});
