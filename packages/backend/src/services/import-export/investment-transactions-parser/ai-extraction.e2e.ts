import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { useSelfHostWithoutServerAiKeys } from '@tests/helpers/ai-test-env';
import { createFirstEndpoint, errorMessage, getTestUserId, readStoredEndpoints } from '@tests/helpers/user-settings';
import { CUSTOM_ENDPOINT_MODEL, getCustomEndpointOfflineMock } from '@tests/mocks/openai-compatible/mock-api';

/**
 * The investment extract route reports a dead user-owned endpoint the same way the
 * statement route does: a message naming the server (never the model), and an `invalid`
 * status on the endpoint so AI settings shows a way back.
 */

const BROKER_EXPORT_BASE64 = Buffer.from('Broker export\nBTC 0.05 @ 42000 USD on 2024-01-15', 'utf-8').toString(
  'base64',
);

describe('Investment transactions AI extraction against a dead endpoint', () => {
  useSelfHostWithoutServerAiKeys();

  it('names the endpoint and flags it when the server is gone', async () => {
    const userId = await getTestUserId();
    await createFirstEndpoint();
    const portfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'AI import' }),
      raw: true,
    });
    global.mswMockServer.use(getCustomEndpointOfflineMock());

    const response = await helpers.investmentImportExtract({
      payload: { fileBase64: BROKER_EXPORT_BASE64, defaultPortfolioId: portfolio.id },
    });

    expect(errorMessage({ response })).toMatch(/did not respond/i);
    expect(errorMessage({ response })).not.toContain(CUSTOM_ENDPOINT_MODEL);

    const [stored] = await readStoredEndpoints({ userId });
    expect(stored?.status).toBe('invalid');
    expect(stored?.lastError).toMatch(/did not respond/i);
  });
});
