import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Securities from '@models/investments/Securities.model';
import * as helpers from '@tests/helpers';

describe('POST /transaction (create investment transaction)', () => {
  let investmentAccount: Accounts;
  let vooSecurity: Securities;

  beforeEach(async () => {
    investmentAccount = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.investment,
        name: 'Investments',
      }),
      raw: true,
    });
    const seededSecurities: Securities[] = await helpers.seedSecuritiesViaSync([
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
    ]);
    vooSecurity = seededSecurities.find((s) => s.symbol === 'VOO')!;
    if (!vooSecurity) throw new Error('VOO security not found after seeding');

    // Create holding for the account/security
    await helpers.createHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id,
      },
    });
  });

  it('should create an investment transaction successfully', async () => {
    const payload = helpers.buildInvestmentTransactionPayload({
      accountId: investmentAccount.id,
      securityId: vooSecurity.id,
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
      quantity: '2',
      price: '50',
    });

    const response = await helpers.createInvestmentTransaction({ payload, raw: true });

    expect(response.accountId).toBe(investmentAccount.id);
    expect(response.securityId).toBe(vooSecurity.id);
    expect(response.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.buy);
    expect(response.quantity).toBeNumericEqual(2);
    expect(response.price).toBeNumericEqual(50);
    expect(response.amount).toBeNumericEqual(100);
  });

  it('fails if holding does not exist', async () => {
    const anotherAccount = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.investment,
        name: 'Other',
      }),
      raw: true,
    });
    const payload = helpers.buildInvestmentTransactionPayload({
      accountId: anotherAccount.id,
      securityId: vooSecurity.id,
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
      quantity: '1',
      price: '10',
    });
    const response = await helpers.createInvestmentTransaction({ payload, raw: false });
    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('fails if required fields are missing', async () => {
    // Missing accountId
    const payloadMissingAccountId = {
      securityId: vooSecurity.id,
      quantity: '1',
      price: '10',
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
    } as ReturnType<typeof helpers.buildInvestmentTransactionPayload>;

    let response = await helpers.createInvestmentTransaction({ payload: payloadMissingAccountId, raw: false });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    // Missing securityId
    const payloadMissingSecurityId = {
      accountId: investmentAccount.id,
      quantity: '1',
      price: '10',
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
    } as ReturnType<typeof helpers.buildInvestmentTransactionPayload>;

    response = await helpers.createInvestmentTransaction({ payload: payloadMissingSecurityId, raw: false });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('correctly calculates amount as quantity * price', async () => {
    const payload = helpers.buildInvestmentTransactionPayload({
      accountId: investmentAccount.id,
      securityId: vooSecurity.id,
      quantity: '3',
      price: '7.5',
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
    });
    const response = await helpers.createInvestmentTransaction({ payload, raw: false });
    expect(response.statusCode).toBe(201);
    expect(helpers.extractResponse(response).amount).toBeNumericEqual(22.5);
  });
});
