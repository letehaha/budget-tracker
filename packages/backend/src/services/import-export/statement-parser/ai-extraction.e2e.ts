import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { useSelfHostWithoutServerAiKeys } from '@tests/helpers/ai-test-env';
import { createFirstEndpoint, errorMessage, getTestUserId, readStoredEndpoints } from '@tests/helpers/user-settings';
import {
  CUSTOM_ENDPOINT_MODEL,
  getCustomEndpointCallCountingMock,
  getCustomEndpointModelNotFoundMock,
  getCustomEndpointOfflineMock,
  getCustomEndpointWebPageMocks,
} from '@tests/mocks/openai-compatible/mock-api';

/**
 * What the extract route tells a user whose own AI endpoint cannot answer, and what it
 * leaves behind on the endpoint: a message naming the server (never the model), and an
 * `invalid` status in AI settings with a way back. A flagged endpoint also fences the
 * route off entirely — extraction must not quietly move to a server-side cloud key.
 */

const STATEMENT_CSV = ['date;description;amount', '2026-06-01;Grocery store;-42.10', '2026-06-02;Salary;2500.00'].join(
  '\n',
);

const STATEMENT_FILE_BASE64 = Buffer.from(STATEMENT_CSV, 'utf-8').toString('base64');

describe('Statement parser AI extraction against a dead endpoint', () => {
  useSelfHostWithoutServerAiKeys();

  it('names the endpoint and flags it when the server is gone', async () => {
    const userId = await getTestUserId();
    await createFirstEndpoint();
    global.mswMockServer.use(getCustomEndpointOfflineMock());

    const response = await helpers.statementExtract({ payload: { fileBase64: STATEMENT_FILE_BASE64 } });

    expect(errorMessage({ response })).toMatch(/did not respond/i);
    expect(errorMessage({ response })).not.toContain(CUSTOM_ENDPOINT_MODEL);

    const [stored] = await readStoredEndpoints({ userId });
    expect(stored?.status).toBe('invalid');
    expect(stored?.lastError).toMatch(/did not respond/i);
  });

  it('flags the endpoint when a web page answers instead of the API', async () => {
    const userId = await getTestUserId();
    await createFirstEndpoint();
    global.mswMockServer.use(...getCustomEndpointWebPageMocks());

    const response = await helpers.statementExtract({ payload: { fileBase64: STATEMENT_FILE_BASE64 } });

    expect(errorMessage({ response })).toMatch(/did not respond/i);

    const [stored] = await readStoredEndpoints({ userId });
    expect(stored?.status).toBe('invalid');
  });

  it('names the model and leaves the endpoint alone when the model is not served', async () => {
    const userId = await getTestUserId();
    await createFirstEndpoint();
    global.mswMockServer.use(getCustomEndpointModelNotFoundMock());

    const response = await helpers.statementExtract({ payload: { fileBase64: STATEMENT_FILE_BASE64 } });

    expect(errorMessage({ response })).toContain(CUSTOM_ENDPOINT_MODEL);
    expect(errorMessage({ response })).toContain('AI settings');

    // The endpoint is reachable and its key works, so its status must survive
    const [stored] = await readStoredEndpoints({ userId });
    expect(stored?.status).toBe('valid');
  });

  // Once flagged, the endpoint is the only thing that may answer: falling through to the
  // server key would send the statement to a provider the user never picked.
  it('refuses to extract at all once every endpoint is flagged, even with a server key', async () => {
    const userId = await getTestUserId();
    await createFirstEndpoint();
    global.mswMockServer.use(getCustomEndpointOfflineMock());
    await helpers.statementExtract({ payload: { fileBase64: STATEMENT_FILE_BASE64 } });

    const [stored] = await readStoredEndpoints({ userId });
    expect(stored?.status).toBe('invalid');

    // The endpoint would now answer again, and a server key exists. If the second call
    // reached either of them the refusal is broken — the endpoint counter proves the
    // flagged server was not dialled, and success there would change the message.
    let endpointCalls = 0;
    global.mswMockServer.use(
      getCustomEndpointCallCountingMock({
        onCall: () => {
          endpointCalls += 1;
        },
      }),
    );
    process.env.GEMINI_API_KEY = 'server-side-gemini-key';

    const response = await helpers.statementExtract({ payload: { fileBase64: STATEMENT_FILE_BASE64 } });

    // Naming the down endpoint, not "add an API key": they have credentials, one server is off
    expect(errorMessage({ response })).toMatch(/did not respond/i);
    expect(endpointCalls).toBe(0);
  });

  it('tells a user with no endpoints and no keys to configure a provider', async () => {
    const response = await helpers.statementExtract({ payload: { fileBase64: STATEMENT_FILE_BASE64 } });

    expect(errorMessage({ response })).toMatch(/no ai provider configured/i);
  });
});
