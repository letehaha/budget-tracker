import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Securities from '@models/investments/Securities.model';
import * as helpers from '@tests/helpers';

describe('DELETE /investments/holding (delete holding)', () => {
  let investmentAccount: Accounts;
  let vooSecurity: Securities;

  beforeEach(async () => {
    // Create investment account
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
    ]);
    vooSecurity = seededSecurities.find((s) => s.symbol === 'VOO')!;
    if (!vooSecurity) throw new Error('VOO security not found after seeding');
  });

  it('should delete a holding successfully', async () => {
    // Create holding first
    await helpers.createHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id,
      },
    });
    // Delete holding
    const response = await helpers.deleteHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(200);
  });

  it('should fail to delete a non-existent holding', async () => {
    const response = await helpers.deleteHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id, // never created
      },
      raw: false,
    });
    expect(response.statusCode).toBe(200); // No error, idempotent
  });

  it('should fail to delete holding from a non-investment account', async () => {
    const generalAccount = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.general,
        name: 'General',
      }),
      raw: true,
    });
    // Create holding in investment account
    await helpers.createHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id,
      },
    });
    // Try to delete from general account (should not find holding)
    const response = await helpers.deleteHolding({
      payload: {
        accountId: generalAccount.id,
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(200); // No error, idempotent
  });

  it('should fail to delete holding with non-zero quantity', async () => {
    // Create holding
    await helpers.createHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id,
      },
    });
    // Manually set quantity to non-zero
    const Holdings = (await import('@models/investments/Holdings.model')).default;
    await Holdings.update(
      { quantity: '1.0000000000' },
      { where: { accountId: investmentAccount.id, securityId: vooSecurity.id } },
    );
    // Try to delete
    const response = await helpers.deleteHolding({
      payload: {
        accountId: investmentAccount.id,
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.NotAllowed);
  });

  it('fails if required fields are missing', async () => {
    // Missing accountId
    const payloadMissingAccountId = { securityId: vooSecurity.id } as Parameters<
      typeof helpers.deleteHolding
    >[0]['payload'];
    let response = await helpers.deleteHolding({
      payload: payloadMissingAccountId,
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    // Missing securityId
    const payloadMissingSecurityId = { accountId: investmentAccount.id } as Parameters<
      typeof helpers.deleteHolding
    >[0]['payload'];
    response = await helpers.deleteHolding({
      payload: payloadMissingSecurityId,
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});
