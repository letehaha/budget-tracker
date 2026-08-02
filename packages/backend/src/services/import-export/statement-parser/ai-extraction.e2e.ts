import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { useSelfHostWithoutServerAiKeys } from '@tests/helpers/ai-test-env';
import { createFirstEndpoint, errorMessage, getTestUserId, readStoredEndpoints } from '@tests/helpers/user-settings';
import {
  CUSTOM_ENDPOINT_MODEL,
  getCustomEndpointAuthErrorMock,
  getCustomEndpointCallCountingMock,
  getCustomEndpointModelNotFoundMock,
  getCustomEndpointOfflineMock,
  getCustomEndpointWebPageMocks,
} from '@tests/mocks/openai-compatible/mock-api';

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

  it('names the rejection and flags the endpoint when it answers 401', async () => {
    const userId = await getTestUserId();
    await createFirstEndpoint();
    global.mswMockServer.use(getCustomEndpointAuthErrorMock());

    const response = await helpers.statementExtract({ payload: { fileBase64: STATEMENT_FILE_BASE64 } });

    expect(errorMessage({ response })).toMatch(/rejected the request/i);
    expect(errorMessage({ response })).toContain('AI settings');

    const [stored] = await readStoredEndpoints({ userId });
    expect(stored?.status).toBe('invalid');
    expect(stored?.lastError).toMatch(/rejected the request/i);
  });

  it('names the model and leaves the endpoint alone when the model is not served', async () => {
    const userId = await getTestUserId();
    await createFirstEndpoint();
    global.mswMockServer.use(getCustomEndpointModelNotFoundMock());

    const response = await helpers.statementExtract({ payload: { fileBase64: STATEMENT_FILE_BASE64 } });

    expect(errorMessage({ response })).toContain(CUSTOM_ENDPOINT_MODEL);
    expect(errorMessage({ response })).toContain('AI settings');

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

    // The endpoint would answer now and a server key exists, so the counter below proves
    // neither of them was dialled.
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

    expect(errorMessage({ response })).toMatch(/did not respond/i);
    expect(endpointCalls).toBe(0);
  });

  it('tells a user with no endpoints and no keys to configure a provider', async () => {
    const response = await helpers.statementExtract({ payload: { fileBase64: STATEMENT_FILE_BASE64 } });

    expect(errorMessage({ response })).toMatch(/no ai provider configured/i);
  });
});
