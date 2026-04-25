import { API_ERROR_CODES, API_RESPONSE_STATUS, BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { VALID_MONOBANK_TOKEN } from '@tests/mocks/monobank/mock-api';

/**
 * E2E tests for DELETE /bank-data-providers/connections/:connectionId.
 *
 * Covers the lookup behavior for the shared `disconnectProvider` service
 * (used across all providers). Provider-specific disconnect behavior is
 * covered in each provider's flow e2e.
 */
describe('Disconnect provider', () => {
  it('returns 404 when the connection does not exist', async () => {
    // Regression: the service used to silently `return;` for missing
    // connections, letting the controller report "Connection removed
    // successfully" regardless. It now throws NotFoundError.
    const response = await helpers.bankDataProviders.disconnectProvider({
      connectionId: 999_999,
    });

    expect(response.statusCode).toBe(404);
    expect(response.body.status).toBe(API_RESPONSE_STATUS.error);
    expect((response.body.response as unknown as { code: string }).code).toBe(API_ERROR_CODES.notFound);
  });

  it('returns 200 and removes the connection for a valid, owned connectionId', async () => {
    const { connectionId } = await helpers.bankDataProviders.connectProvider({
      providerType: BANK_PROVIDER_TYPE.MONOBANK,
      credentials: { apiToken: VALID_MONOBANK_TOKEN },
      raw: true,
    });

    const response = await helpers.bankDataProviders.disconnectProvider({ connectionId });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe(API_RESPONSE_STATUS.success);

    const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
    expect(connections.find((c) => c.id === connectionId)).toBeUndefined();
  });

  it('returns 404 on a second disconnect of the same connection', async () => {
    // Regression: pre-fix, a double-disconnect returned 200 for both calls.
    const { connectionId } = await helpers.bankDataProviders.connectProvider({
      providerType: BANK_PROVIDER_TYPE.MONOBANK,
      credentials: { apiToken: VALID_MONOBANK_TOKEN },
      raw: true,
    });

    const first = await helpers.bankDataProviders.disconnectProvider({ connectionId });
    expect(first.statusCode).toBe(200);

    const second = await helpers.bankDataProviders.disconnectProvider({ connectionId });
    expect(second.statusCode).toBe(404);
    expect((second.body.response as unknown as { code: string }).code).toBe(API_ERROR_CODES.notFound);
  });
});
