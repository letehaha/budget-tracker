import { TRANSACTION_TYPES } from '@bt/shared/types';
import { afterEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { startOfDay, subDays } from 'date-fns';

/** A manual `INR → AED` rate prices every stored day of an INR account, not only the
 *  spot balance on the account card. */

const TODAY = startOfDay(new Date());
const DEPOSIT_DATE = subDays(TODAY, 60);
const SEEDED_DATES = [DEPOSIT_DATE, TODAY];

const CUSTOM_INR_TO_AED = 0.5;
const EDITED_INR_TO_AED = 0.25;

const HOLDINGS_INR = 100_000;
const HOLDINGS_INR_CENTS = HOLDINGS_INR * 100;

const seedMarketRates = () => helpers.seedInrAedRates({ depositDate: DEPOSIT_DATE, laterDates: [TODAY] });

const setCustomRate = ({ inrToAed }: { inrToAed: number }) =>
  helpers.editCurrencyExchangeRate({
    pairs: [
      { baseCode: 'INR', quoteCode: 'AED', rate: inrToAed },
      { baseCode: 'AED', quoteCode: 'INR', rate: 1 / inrToAed },
    ],
    raw: true,
  });

const createInrAccountWithHoldings = async () => {
  await helpers.addUserCurrencies({ currencyCodes: ['INR'] });
  const account = await helpers.createAccount({
    payload: helpers.buildAccountPayload({ currencyCode: 'INR' }),
    raw: true,
  });

  await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId: account.id,
      amount: HOLDINGS_INR,
      transactionType: TRANSACTION_TYPES.income,
      time: DEPOSIT_DATE.toISOString(),
    }),
    raw: true,
  });

  return account;
};

describe('Custom exchange rate and foreign-currency balance history', () => {
  afterEach(async () => {
    await helpers.clearExchangeRatesForDates({ dates: SEEDED_DATES });
  });

  it('re-prices the whole stored history when the manual rate is edited', async () => {
    await seedMarketRates();
    const account = await createInrAccountWithHoldings();

    await setCustomRate({ inrToAed: CUSTOM_INR_TO_AED });

    const afterSet = await helpers.getBalanceHistory({ accountId: account.id, raw: true });
    expect(helpers.balanceCentsOn({ rows: afterSet, date: DEPOSIT_DATE })).toEqualRefValue(
      HOLDINGS_INR_CENTS * CUSTOM_INR_TO_AED,
    );
    expect(helpers.balanceCentsOn({ rows: afterSet, date: TODAY })).toEqualRefValue(
      HOLDINGS_INR_CENTS * CUSTOM_INR_TO_AED,
    );

    await setCustomRate({ inrToAed: EDITED_INR_TO_AED });

    const afterEdit = await helpers.getBalanceHistory({ accountId: account.id, raw: true });
    expect(helpers.balanceCentsOn({ rows: afterEdit, date: DEPOSIT_DATE })).toEqualRefValue(
      HOLDINGS_INR_CENTS * EDITED_INR_TO_AED,
    );
    expect(helpers.balanceCentsOn({ rows: afterEdit, date: TODAY })).toEqualRefValue(
      HOLDINGS_INR_CENTS * EDITED_INR_TO_AED,
    );
  });

  it('falls back to per-day market rates when the manual rate is removed', async () => {
    await seedMarketRates();
    const account = await createInrAccountWithHoldings();

    await setCustomRate({ inrToAed: CUSTOM_INR_TO_AED });

    await helpers.removeCurrencyExchangeRate({
      pairs: [
        { baseCode: 'INR', quoteCode: 'AED' },
        { baseCode: 'AED', quoteCode: 'INR' },
      ],
      raw: true,
    });

    const rows = await helpers.getBalanceHistory({ accountId: account.id, raw: true });

    expect(helpers.balanceCentsOn({ rows, date: DEPOSIT_DATE })).toEqualRefValue(
      HOLDINGS_INR_CENTS * helpers.INR_TO_AED_AT_DEPOSIT,
    );
    expect(helpers.balanceCentsOn({ rows, date: TODAY })).toEqualRefValue(
      HOLDINGS_INR_CENTS * helpers.INR_TO_AED_AFTER,
    );
  });
});
