import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { connection } from '@models/index';
import * as helpers from '@tests/helpers';

/**
 * The custom-rate edit and remove endpoints both re-anchor the user's account
 * `ref*` balances (spot measures) to the new rate via `remeasureRefBalances`.
 * When no market rate exists for an account's currency, that account keeps its
 * stale base-currency value and the remeasure reports it as `failed`. These tests
 * pin that the endpoints surface the `{ updated, failed }` counts in their HTTP
 * response so the client can warn the user that a balance refresh lagged — the
 * rate write itself still succeeds.
 */

type RemeasureBody = { remeasure: { updated: number; failed: number } };

// A EUR account's ref balance is measured in the user's base currency, so the
// custom rate that drives (and later fails) the remeasure is EUR ⇄ base.
const CUSTOM_EUR_TO_BASE = 5;
const CUSTOM_BASE_TO_EUR = 0.2;

const buildCustomRatePairs = () => {
  const baseCode = global.BASE_CURRENCY!.code;
  return [
    { baseCode: 'EUR', quoteCode: baseCode, rate: CUSTOM_EUR_TO_BASE },
    { baseCode: baseCode, quoteCode: 'EUR', rate: CUSTOM_BASE_TO_EUR },
  ];
};

const createEurAccountWithIncome = async () => {
  const account = await helpers.createAccount({
    payload: helpers.buildAccountPayload({ currencyCode: 'EUR' }),
    raw: true,
  });
  await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId: account.id,
      amount: 100,
      transactionType: TRANSACTION_TYPES.income,
    }),
    raw: true,
  });
  return account;
};

describe('Custom-rate endpoints surface the ref-balance remeasure result', () => {
  it('reports remeasure.failed when removing a custom rate leaves an account with no market rate', async () => {
    await helpers.addUserCurrencies({ currencyCodes: ['EUR'] });

    // Create the account+income at the MARKET rate first. This runs a real market
    // conversion for today, which marks today's rate basket as comprehensively
    // fetched — so the post-delete remeasure below can't silently re-fetch and heal
    // the currency we're about to strip. (Setting the custom rate first would route
    // the conversion through the custom rate and skip that market fetch entirely.)
    await createEurAccountWithIncome();

    // Now turn off live rates and pin a custom EUR ⇄ base rate.
    await helpers.updateUserCurrency({
      currency: { currencyCode: 'EUR', liveRateUpdate: false },
      raw: true,
    });
    await helpers.editCurrencyExchangeRate({ pairs: buildCustomRatePairs() });

    // Simulate a total FX-data gap for EUR: drop every stored USD-pivot row that
    // could convert EUR, on any date. ExchangeRates is a seed table shared across
    // tests on this worker, so snapshot the rows first and re-insert in `finally`.
    const [eurRates] = (await connection.sequelize.query(
      `SELECT "baseCode", "quoteCode", "date", "rate", "source"
       FROM "ExchangeRates" WHERE "quoteCode" = 'EUR' OR "baseCode" = 'EUR'`,
    )) as [Array<Record<string, unknown>>, unknown];

    try {
      await connection.sequelize.query(`DELETE FROM "ExchangeRates" WHERE "quoteCode" = 'EUR' OR "baseCode" = 'EUR'`);

      // Removing the custom rate reverts EUR to market rates — but none exist now,
      // so the EUR account can't be remeasured and keeps its stale value.
      const baseCode = global.BASE_CURRENCY!.code;
      const res = await helpers.removeCurrencyExchangeRate({
        pairs: [
          { baseCode: 'EUR', quoteCode: baseCode },
          { baseCode: baseCode, quoteCode: 'EUR' },
        ],
      });

      // The rate write committed — the endpoint succeeds…
      expect(res.statusCode).toBe(200);
      // …but the response reports the lagging refresh so the client can warn.
      const body = helpers.extractResponse<RemeasureBody>(res);
      expect(body.remeasure.failed).toBeGreaterThanOrEqual(1);
    } finally {
      for (const row of eurRates) {
        await connection.sequelize.query(
          `INSERT INTO "ExchangeRates" ("baseCode", "quoteCode", "date", "rate", "source")
           VALUES (:baseCode, :quoteCode, :date, :rate, :source)`,
          { replacements: row },
        );
      }
    }
  });

  it('reports remeasure.updated with zero failures when editing a custom rate with rates present', async () => {
    await helpers.addUserCurrencies({ currencyCodes: ['EUR'] });
    await helpers.updateUserCurrency({
      currency: { currencyCode: 'EUR', liveRateUpdate: false },
      raw: true,
    });

    // Account created before any custom rate → ref balance stamped at the market
    // rate. Editing the custom rate below moves it, so the remeasure counts it.
    await createEurAccountWithIncome();

    const res = await helpers.editCurrencyExchangeRate({ pairs: buildCustomRatePairs() });

    expect(res.statusCode).toBe(200);
    const body = helpers.extractResponse<RemeasureBody>(res);
    expect(body.remeasure.updated).toBeGreaterThanOrEqual(1);
    expect(body.remeasure.failed).toBe(0);
  });
});
