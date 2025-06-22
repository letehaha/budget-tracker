import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Securities from '@models/investments/Securities.model';
import { restClient } from '@polygon.io/client-js';
import * as helpers from '@tests/helpers';

const mockedRestClient = jest.mocked(restClient);
const mockApi = mockedRestClient.getMockImplementation()!('test');
const mockedAggregates = jest.mocked(mockApi.stocks.aggregates);

describe('POST /investments/holding (create holding)', () => {
  let investmentAccount: Accounts;
  let vooSecurity: Securities;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create accounts
    investmentAccount = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.investment,
        name: 'Investments',
      }),
      raw: true,
    });

    // Seed securities and get VOO
    const seededSecurities: Securities[] = await helpers.seedSecuritiesViaSync([
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
      { symbol: 'AAPL', name: 'Apple Inc.' },
      { symbol: 'AMD', name: 'AMD' },
      { symbol: 'GOOG', name: 'Alphabet Inc.' },
    ]);
    vooSecurity = seededSecurities.find((s) => s.symbol === 'VOO')!;
    if (!vooSecurity) throw new Error('VOO security not found after seeding');
  });

  it('should create a holding, add currency for the user, and trigger a background price sync', async () => {
    mockedAggregates.mockResolvedValue({
      results: [
        { c: 100, t: new Date().getTime() }, // c = close price, t = timestamp
      ],
    });

    const holding = await helpers.createHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id,
      },
      raw: true,
    });

    await helpers.sleep(1000);

    expect(holding.quantity).toBe('0.0000000000');
    expect(holding.costBasis).toBe('0.0000000000');
    expect(mockedAggregates).toHaveBeenCalled();
    expect(mockedAggregates.mock.calls[0]?.[0]).toBe(vooSecurity.symbol);

    // New assertion: user should have the security's currency
    const userCurrencies = await helpers.getUserCurrencies();
    const hasSecurityCurrency = userCurrencies.some((uc) => uc.currency.code === vooSecurity.currencyCode);
    expect(hasSecurityCurrency).toBe(true);
  });

  it('should fail to create a holding in a non-investment account', async () => {
    const generalAccount = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.general,
        name: 'General',
      }),
      raw: true,
    });

    const response = await helpers.createHolding({
      payload: {
        accountId: generalAccount.id, // Using the general account
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.NotAllowed);
  });

  it('should fail to create a duplicate holding', async () => {
    // First create the holding
    await helpers.createHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id,
      },
    });
    // Try to create it again
    const response = await helpers.createHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id, // Already created in the first test
      },
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
  });

  it('fails if account does not exist', async () => {
    const response = await helpers.createHolding({
      payload: {
        accountId: 999999, // non-existent
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('fails if security does not exist', async () => {
    const response = await helpers.createHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: 999999, // non-existent
      },
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('fails if required fields are missing', async () => {
    // Missing accountId
    const payloadMissingAccountId = { securityId: vooSecurity.id } as Parameters<
      typeof helpers.createHolding
    >[0]['payload'];

    let response = await helpers.createHolding({
      payload: payloadMissingAccountId,
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    // Missing securityId
    const payloadMissingSecurityId = { accountId: investmentAccount.id } as Parameters<
      typeof helpers.createHolding
    >[0]['payload'];

    response = await helpers.createHolding({
      payload: payloadMissingSecurityId,
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('background sync is not called on duplicate', async () => {
    await helpers.createHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id,
      },
    });
    await helpers.sleep(200); // sync is triggered in background, so we need to wait for it to clear
    mockedAggregates.mockClear();
    const response = await helpers.createHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
    expect(mockedAggregates).not.toHaveBeenCalled();
  });

  it('correctly sets all default values', async () => {
    mockedAggregates.mockResolvedValue({
      results: [{ c: 123, t: new Date().getTime() }],
    });
    const holding = await helpers.createHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id,
      },
      raw: true,
    });
    expect(holding.quantity).toBe('0.0000000000');
    expect(holding.costBasis).toBe('0.0000000000');
    expect(holding.refCostBasis).toBe('0.0000000000');
    expect(holding.value).toBe('0.0000000000');
    expect(holding.refValue).toBe('0.0000000000');
    expect(typeof holding.currencyCode).toBe('string');
    expect(holding.accountId).toBe(investmentAccount.id);
    expect(holding.securityId).toBe(vooSecurity.id);
  });

  it.todo('prevents race condition on duplicate (only one succeeds)');
});
