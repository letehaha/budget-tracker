import * as helpers from '@tests/helpers';
import {
  FixedTransaction,
  MOCK_AUTHORIZATION_ID,
  MOCK_AUTH_CODE,
  MOCK_BANK_COUNTRY,
  MOCK_BANK_NAME,
  MOCK_ENABLE_BANKING_APP_ID,
  MOCK_ENABLE_BANKING_PRIVATE_KEY,
  getMockedASPSPData,
  resetMockTransactionConfig,
  setMockTransactionConfig,
} from '@tests/mocks/enablebanking/data';
import { resetSessionCounter as resetMockSessionCounter } from '@tests/mocks/enablebanking/mock-api';

/**
 * Helper to get list of countries (ASPSPs)
 */
const listCountries = () => {
  return helpers.makeRequest({
    method: 'get',
    url: '/bank-data-providers/enable-banking/countries',
  });
};

/**
 * Helper to get list of banks for a country
 */
const listBanks = (country: string) => {
  return helpers.makeRequest({
    method: 'get',
    url: `/bank-data-providers/enable-banking/banks?country=${country}`,
  });
};

/**
 * Helper to simulate OAuth callback
 * This completes the connection after it's been created
 */
const simulateOAuthCallback = async ({
  connectionId,
  state,
  code = MOCK_AUTH_CODE,
}: {
  connectionId: number;
  state: string;
  code?: string;
}) => {
  return helpers.makeRequest({
    method: 'get',
    url: `/bank-data-providers/enable-banking/oauth-callback?code=${code}&state=${state}&connection_id=${connectionId}`,
  });
};

/**
 * Helper to reauthorize a connection
 */
const reauthorizeConnection = (connectionId: number) => {
  return helpers.makeRequest({
    method: 'post',
    url: `/bank-data-providers/connections/${connectionId}/reauthorize`,
  });
};

/**
 * Get mock ASPSP data
 */
const mockedASPSPData = getMockedASPSPData;

/**
 * Get mock credentials
 */
const mockCredentials = () => ({
  appId: MOCK_ENABLE_BANKING_APP_ID,
  privateKey: MOCK_ENABLE_BANKING_PRIVATE_KEY,
  bankName: MOCK_BANK_NAME,
  bankCountry: MOCK_BANK_COUNTRY,
  redirectUrl: 'http://localhost:8100/bank-callback',
});

/**
 * Get mock OAuth state from connection metadata
 * Helper to extract state from a pending connection
 */
const getConnectionState = async (connectionId: number): Promise<string> => {
  // We need to access the database model directly to get metadata
  // since it's not exposed in the API response
  const BankDataProviderConnections = (await import('@models/BankDataProviderConnections.model')).default;

  const connection = await BankDataProviderConnections.findByPk(connectionId);

  if (!connection) {
    throw new Error(`Connection ${connectionId} not found`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metadata = connection.metadata as any;

  if (!metadata?.state) {
    throw new Error(`No state found in connection ${connectionId} metadata`);
  }

  return metadata.state;
};

/**
 * Reset mock session counter
 * Call this before tests that need fresh session state
 */
const resetSessionCounter = () => {
  resetMockSessionCounter();
};

/**
 * Set fixed transactions for testing.
 * Use this to control exactly what transactions are returned by the mock API.
 */
const setFixedTransactions = (transactions: FixedTransaction[]) => {
  setMockTransactionConfig({ fixedTransactions: transactions });
};

/**
 * Reset mock transaction configuration to defaults.
 * Call this after tests that modify transaction config.
 */
const resetTransactionConfig = () => {
  resetMockTransactionConfig();
};

export default {
  listCountries,
  listBanks,
  simulateOAuthCallback,
  reauthorizeConnection,
  mockedASPSPData,
  mockCredentials,
  getConnectionState,
  resetSessionCounter,
  setFixedTransactions,
  resetTransactionConfig,
  // Export mock constants for direct use in tests
  mockAppId: MOCK_ENABLE_BANKING_APP_ID,
  mockPrivateKey: MOCK_ENABLE_BANKING_PRIVATE_KEY,
  mockBankName: MOCK_BANK_NAME,
  mockBankCountry: MOCK_BANK_COUNTRY,
  mockAuthCode: MOCK_AUTH_CODE,
  mockAuthorizationId: MOCK_AUTHORIZATION_ID,
};
