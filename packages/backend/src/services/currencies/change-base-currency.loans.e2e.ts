import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, API_RESPONSE_STATUS, LOAN_TYPE } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Accounts from '@models/accounts.model';
import * as helpers from '@tests/helpers';

/**
 * A loan carries its own currency on the underlying Account (`accountCategory: loan`).
 * Changing the user's base currency must recalculate the loan's `ref*` amounts into the
 * new base but must NEVER rewrite the loan's own `currencyCode` — a EUR mortgage stays a
 * EUR mortgage no matter what the user's base currency is. These tests lock that contract
 * in so a future change to `recalculateAccounts` can't silently re-denominate loans.
 */
describe('Change Base Currency — loans keep their own currency', () => {
  beforeEach(async () => {
    // Pin the base to GBP, then make EUR + USD available as loan / target currencies.
    await helpers.makeRequest({
      method: 'post',
      url: '/user/currencies/base',
      payload: { currencyCode: 'GBP' },
    });
    await helpers.addUserCurrencies({ currencyCodes: ['EUR', 'USD'], raw: true });
  });

  const changeBaseTo = (newCurrencyCode: string) =>
    helpers.makeRequest({
      method: 'post',
      url: '/user/currencies/change-base',
      payload: { newCurrencyCode },
    });

  it('preserves a foreign-currency loan currency while recalculating its ref amounts', async () => {
    // Loan in EUR, distinct from both the old base (GBP) and the new base (USD).
    const loan = await helpers.createLoan({
      payload: helpers.buildCreateLoanPayload({
        name: 'EUR mortgage',
        currencyCode: 'EUR',
        initialBalance: 200_000,
        originalPrincipal: 200_000,
        loanType: LOAN_TYPE.mortgage,
      }),
      raw: true,
    });

    // Snapshot the nominal (own-currency) figures that must survive the change untouched.
    const originalCurrencyCode = loan.currencyCode;
    const originalCurrentBalance = loan.currentBalance;
    const originalOriginalPrincipal = loan.loanDetails.originalPrincipal;

    // Snapshot the ref* figures (in the OLD base, GBP) that must be recalculated into USD.
    const refPlannedPaymentBefore = loan.loanDetails.refPlannedPayment;
    const refOriginalPrincipalBefore = loan.loanDetails.refOriginalPrincipal;
    const refMinPaymentBefore = loan.loanDetails.refMinPayment;

    const accountBefore = await Accounts.findByPk(loan.id, { raw: true });
    const refInitialBalanceBefore = accountBefore!.refInitialBalance;

    const response = await changeBaseTo('USD');
    expect(response.statusCode).toEqual(200);
    expect(response.body.status).toEqual(API_RESPONSE_STATUS.success);
    expect(response.body.response.loanDetailsUpdated).toBeGreaterThan(0);

    // Base currency actually flipped.
    const newBaseCurrency = (await helpers.getUserCurrencies()).find((i) => i.isDefaultCurrency)!;
    expect(newBaseCurrency.currencyCode).toEqual('USD');

    // The loan still reports EUR — both through the API and on the raw account row.
    const loanAfter = await helpers.getLoanById({ id: loan.id, raw: true });
    expect(loanAfter.currencyCode).toEqual('EUR');
    expect(loanAfter.currencyCode).toEqual(originalCurrencyCode);
    expect(loanAfter.accountCategory).toEqual(ACCOUNT_CATEGORIES.loan);

    const accountAfter = await Accounts.findByPk(loan.id, { raw: true });
    expect(accountAfter!.currencyCode).toEqual('EUR');
    expect(accountAfter!.type).toEqual(ACCOUNT_TYPES.system);

    // Nominal own-currency figures are preserved.
    expect(loanAfter.currentBalance).toEqual(originalCurrentBalance);
    expect(loanAfter.loanDetails.originalPrincipal).toEqual(originalOriginalPrincipal);

    // The ref balance WAS recalculated into the new base (EUR→USD rate differs from EUR→GBP).
    expect(accountAfter!.refInitialBalance).not.toEqual(refInitialBalanceBefore);

    // LoanDetails ref* copies (read by the base-currency aggregates on /loans) were
    // recalculated too — otherwise the monthly-obligation total keeps the old base value.
    expect(loanAfter.loanDetails.refPlannedPayment).not.toEqual(refPlannedPaymentBefore);
    expect(loanAfter.loanDetails.refOriginalPrincipal).not.toEqual(refOriginalPrincipalBefore);
    expect(loanAfter.loanDetails.refMinPayment).not.toEqual(refMinPaymentBefore);
    // Nominal payment figures stay in the loan's own currency (EUR), untouched.
    expect(loanAfter.loanDetails.plannedPayment).toEqual(loan.loanDetails.plannedPayment);
  });

  it('keeps a loan denominated in the incoming base currency as 1:1 after the switch', async () => {
    // Loan in USD, which is exactly the currency the user switches into.
    const loan = await helpers.createLoan({
      payload: helpers.buildCreateLoanPayload({
        name: 'USD auto loan',
        currencyCode: 'USD',
        initialBalance: 30_000,
        originalPrincipal: 30_000,
        loanType: LOAN_TYPE.auto,
      }),
      raw: true,
    });

    const response = await changeBaseTo('USD');
    expect(response.statusCode).toEqual(200);

    const loanAfter = await helpers.getLoanById({ id: loan.id, raw: true });
    // Currency untouched.
    expect(loanAfter.currencyCode).toEqual('USD');

    // Now that USD is the base, the loan's ref amounts equal its nominal amounts 1:1.
    const accountAfter = await Accounts.findByPk(loan.id, { raw: true });
    expect(accountAfter!.refInitialBalance).toEqual(accountAfter!.initialBalance);

    // LoanDetails ref* copies collapse to their nominal values too (USD→USD is 1:1).
    expect(loanAfter.loanDetails.refOriginalPrincipal).toEqual(loanAfter.loanDetails.originalPrincipal);
    expect(loanAfter.loanDetails.refPlannedPayment).toEqual(loanAfter.loanDetails.plannedPayment);
    expect(loanAfter.loanDetails.refMinPayment).toEqual(loanAfter.loanDetails.minPayment);
  });

  it('leaves every loan on its own currency when multiple currencies coexist', async () => {
    const [eurLoan, usdLoan, gbpLoan] = await Promise.all([
      helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ name: 'EUR loan', currencyCode: 'EUR' }),
        raw: true,
      }),
      helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ name: 'USD loan', currencyCode: 'USD' }),
        raw: true,
      }),
      helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({ name: 'GBP loan', currencyCode: 'GBP' }),
        raw: true,
      }),
    ]);

    const response = await changeBaseTo('USD');
    expect(response.statusCode).toEqual(200);

    const [eurAfter, usdAfter, gbpAfter] = await Promise.all([
      helpers.getLoanById({ id: eurLoan.id, raw: true }),
      helpers.getLoanById({ id: usdLoan.id, raw: true }),
      helpers.getLoanById({ id: gbpLoan.id, raw: true }),
    ]);

    expect(eurAfter.currencyCode).toEqual('EUR');
    expect(usdAfter.currencyCode).toEqual('USD');
    expect(gbpAfter.currencyCode).toEqual('GBP');
  });
});
