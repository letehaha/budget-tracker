import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTION_TYPES } from '@bt/shared/types';
import { afterEach, describe, expect, it } from '@jest/globals';
import { connection } from '@models/index';
import * as helpers from '@tests/helpers';
import { startOfDay, subDays } from 'date-fns';

/**
 * The ledger-boundary (earliest-transaction) rate that `recalculateAccounts` uses to
 * restamp `refInitialBalance` on a base-currency change must be resolved by
 * `accountId`, NOT by the transaction AUTHOR's `userId`. On a shared account a
 * recipient with `write` permission creates rows under their own userId, so an
 * author-scoped boundary query drops a recipient-authored earliest row, picks a
 * later boundary, and diverges from `restampRefInitialBalance` (which is
 * account-scoped) — the next transaction write then restamps a different value and
 * re-baselines the whole Balances history.
 *
 * The change-base guard blocks the switch while a share is active, so the reachable
 * window is: recipient authors the earliest row, the share is revoked (recipient
 * rows survive), then the owner changes base.
 */

// Five days back, with its own EUR/AED rates so the boundary-date conversion differs
// sharply from today's basket. EUR→USD historical = 1 / 0.5 = 2.0.
const HISTORICAL_DATE = subDays(startOfDay(new Date()), 5);
const HISTORICAL_EUR_PER_USD = 0.5;
const HISTORICAL_AED_PER_USD = 3.5;
const HISTORICAL_EUR_TO_USD = 1 / HISTORICAL_EUR_PER_USD; // 2.0

const decimalToCents = (decimal: unknown) => Math.round(Number(decimal) * 100);

const seedHistoricalRates = async () => {
  await connection.sequelize.query(
    `INSERT INTO "ExchangeRates" ("baseCode", "quoteCode", "date", "rate", "source")
     VALUES ('USD', 'EUR', :date, :eurRate, 'api-layer'), ('USD', 'AED', :date, :aedRate, 'api-layer')`,
    {
      replacements: { date: HISTORICAL_DATE, eurRate: HISTORICAL_EUR_PER_USD, aedRate: HISTORICAL_AED_PER_USD },
    },
  );
};

describe('Change base currency — shared-account ledger boundary is author-blind', () => {
  afterEach(async () => {
    await connection.sequelize.query(`DELETE FROM "ExchangeRates" WHERE date = :date`, {
      replacements: { date: HISTORICAL_DATE },
    });
  });

  it('restamps refInitialBalance at a recipient-authored earliest transaction’s boundary date, and a later owner write does not re-baseline it', async () => {
    // Owner (primary user, base AED). Connect EUR (the account currency) and USD
    // (the change-base target).
    await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'] });

    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ currencyCode: 'EUR', initialBalance: 200 }),
      raw: true,
    });

    // Recipient defaults to the same base (AED) — the accept guard requires it — and
    // connects EUR so their transaction can convert.
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();

    const invitation = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.account,
      resourceId: account.id,
      permission: SHARE_PERMISSIONS.write,
      raw: true,
    });
    const acceptRes = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: false }),
    });
    expect(acceptRes.statusCode).toBe(200);

    // Rates for the boundary date must exist before the backdated write lands.
    await seedHistoricalRates();

    // The RECIPIENT authors the earliest transaction on the owner's account — its
    // row carries the recipient's userId, so an author-scoped boundary query would
    // never see it.
    const recipientTx = await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        await helpers.addUserCurrencies({ currencyCodes: ['EUR'] });
        return helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
            time: HISTORICAL_DATE.toISOString(),
          }),
          raw: false,
        });
      },
    });
    expect(recipientTx.statusCode).toBe(200);

    // Revoke the share so the change-base guard lets the switch through. The
    // recipient's transaction row stays on the owner's account (only account-type
    // transfers are converted on revoke; a plain income row is untouched).
    const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
    await helpers.revokeShareMember({
      resourceType: RESOURCE_TYPES.account,
      resourceId: account.id,
      memberUserId: recipientApp.id,
      raw: true,
    });

    // Owner switches base AED → USD.
    const changeRes = await helpers.makeRequest({
      method: 'post',
      url: '/user/currencies/change-base',
      payload: { newCurrencyCode: 'USD' },
    });
    expect(changeRes.statusCode).toBe(200);

    // refInitialBalance = opening 200 EUR × EUR→USD at the recipient tx's boundary
    // date (2.0) = 400 USD. An author-scoped boundary would have found no owner row,
    // fallen back to today's rate (~1.05), and stamped ~210 instead. This is the same
    // account-scoped boundary `restampRefInitialBalance` uses, so the two agree.
    const afterChange = await helpers.getAccount({ id: account.id, raw: true });
    expect(decimalToCents(afterChange.refInitialBalance)).toEqualRefValue(20000 * HISTORICAL_EUR_TO_USD);

    // A subsequent owner-authored write triggers the account-scoped restamp. Because
    // change-base already used the same (account-scoped) boundary, refInitialBalance
    // must NOT move — it stays the boundary-rate value in the NEW base (400 USD).
    // (This also guards the ref-amount cache: keyed on the resolved quote currency,
    // the pre-change AED entry can't be re-served now that the base is USD.)
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    const afterOwnerWrite = await helpers.getAccount({ id: account.id, raw: true });
    expect(decimalToCents(afterOwnerWrite.refInitialBalance)).toEqualRefValue(20000 * HISTORICAL_EUR_TO_USD);
  });
});
