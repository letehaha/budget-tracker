import { describe, expect, it } from '@jest/globals';
import {
  ENCRYPTED_STATEMENT_PASSWORD,
  STATEMENT_PDF_FIXTURES,
  readStatementPdfFixture,
} from '@tests/fixtures/statement-parser-fixtures';
import * as helpers from '@tests/helpers';
import { useSelfHostWithoutServerAiKeys } from '@tests/helpers/ai-test-env';
import { createFirstEndpoint, errorMessage, getTestUserId, readStoredEndpoints } from '@tests/helpers/user-settings';
import {
  CUSTOM_ENDPOINT_MODEL,
  getCustomEndpointAuthErrorMock,
  getCustomEndpointCallCountingMock,
  getCustomEndpointContentMock,
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

/** First line is the metadata row, the rest are transactions, per the extraction prompt. */
const AI_CSV_REPLY = [
  'Testbanken,4321,2026-06-01,2026-06-30,SEK',
  '2026-06-01,Card purchase,LIDL STOCKHOLM,42.10,E,1000.00,95',
].join('\n');

function encryptedPdfBase64(): string {
  return readStatementPdfFixture({ file: STATEMENT_PDF_FIXTURES.encrypted }).toString('base64');
}

describe('Statement parser extraction of an encrypted PDF', () => {
  useSelfHostWithoutServerAiKeys();

  // Retyping the password fixes this, so it must not answer as a server fault.
  it('answers 422 and names the password when none was sent and when it was rejected', async () => {
    await createFirstEndpoint();

    const missingPassword = await helpers.statementExtract({ payload: { fileBase64: encryptedPdfBase64() } });

    expect(missingPassword.statusCode).toBe(422);
    expect(errorMessage({ response: missingPassword })).toMatch(/password/i);

    const rejectedPassword = await helpers.statementExtract({
      payload: { fileBase64: encryptedPdfBase64(), password: 'not-the-password' },
    });

    expect(rejectedPassword.statusCode).toBe(422);
    expect(errorMessage({ response: rejectedPassword })).toMatch(/password/i);
  });

  it('extracts the statement once the correct password is supplied', async () => {
    await createFirstEndpoint();
    global.mswMockServer.use(getCustomEndpointContentMock({ content: AI_CSV_REPLY }));

    const result = await helpers.statementExtract({
      payload: { fileBase64: encryptedPdfBase64(), password: ENCRYPTED_STATEMENT_PASSWORD },
      raw: true,
    });

    expect(result.fileType).toBe('pdf');
    expect(result.metadata.currencyCode).toBe('SEK');
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ amount: 42.1, type: 'expense', merchant: 'LIDL STOCKHOLM' });
  });
});
