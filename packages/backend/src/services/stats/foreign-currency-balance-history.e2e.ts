import { type RecordId, TRANSACTION_TYPES } from '@bt/shared/types';
import { afterEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { eachDayOfInterval, format, startOfDay, subDays } from 'date-fns';

/**
 * A day's stored balance for a non-base-currency account is the foreign units held
 * that day valued at THAT day's rate, never a running sum of per-transaction rates.
 */

const TODAY = startOfDay(new Date());
const YESTERDAY = subDays(TODAY, 1);
const DEPOSIT_DATE = subDays(TODAY, 90);
const LATER_DATE = subDays(TODAY, 45);
const SEEDED_DATES = [DEPOSIT_DATE, LATER_DATE, YESTERDAY, TODAY];

const HOLDINGS_INR = 100_000;
const HOLDINGS_INR_CENTS = HOLDINGS_INR * 100;

const seedRates = () =>
  helpers.seedInrAedRates({ depositDate: DEPOSIT_DATE, laterDates: [LATER_DATE, YESTERDAY, TODAY] });

const createInrAccount = async () => {
  await helpers.addUserCurrencies({ currencyCodes: ['INR'] });
  return helpers.createAccount({
    payload: helpers.buildAccountPayload({ currencyCode: 'INR' }),
    raw: true,
  });
};

const depositHoldings = ({ accountId }: { accountId: RecordId }) =>
  helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId,
      amount: HOLDINGS_INR,
      transactionType: TRANSACTION_TYPES.income,
      time: DEPOSIT_DATE.toISOString(),
    }),
    raw: true,
  });

describe('Balance history for foreign-currency accounts', () => {
  afterEach(async () => {
    await helpers.clearExchangeRatesForDates({ dates: SEEDED_DATES });
  });

  it('shows zero on every day after the account is drained of foreign units', async () => {
    await seedRates();
    const account = await createInrAccount();

    await depositHoldings({ accountId: account.id });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: HOLDINGS_INR,
        transactionType: TRANSACTION_TYPES.expense,
        time: LATER_DATE.toISOString(),
      }),
      raw: true,
    });

    const rows = await helpers.getBalanceHistory({ accountId: account.id, raw: true });

    const nonZeroDays = eachDayOfInterval({ start: LATER_DATE, end: TODAY })
      .filter((date) => helpers.balanceCentsOn({ rows, date }) !== 0)
      .map((date) => format(date, 'yyyy-MM-dd'));

    expect(nonZeroDays).toEqual([]);
  });

  it('has no cliff between yesterday and today when the rate is unchanged', async () => {
    await seedRates();
    const account = await createInrAccount();

    await depositHoldings({ accountId: account.id });

    const rows = await helpers.getBalanceHistory({ accountId: account.id, raw: true });

    expect(helpers.balanceCentsOn({ rows, date: TODAY })).toEqualRefValue(
      HOLDINGS_INR_CENTS * helpers.INR_TO_AED_AFTER,
    );
    expect(helpers.balanceCentsOn({ rows, date: YESTERDAY })).toBe(helpers.balanceCentsOn({ rows, date: TODAY }));
  });

  it('values each historical day at that day’s rate', async () => {
    await seedRates();
    const account = await createInrAccount();

    await depositHoldings({ accountId: account.id });

    const rows = await helpers.getBalanceHistory({ accountId: account.id, raw: true });

    expect(helpers.balanceCentsOn({ rows, date: DEPOSIT_DATE })).toEqualRefValue(
      HOLDINGS_INR_CENTS * helpers.INR_TO_AED_AT_DEPOSIT,
    );
    expect(helpers.balanceCentsOn({ rows, date: LATER_DATE })).toEqualRefValue(
      HOLDINGS_INR_CENTS * helpers.INR_TO_AED_AFTER,
    );
  });
});
