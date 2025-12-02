import { HttpResponse, http } from 'msw';

import {
  MOCK_AUTHORIZATION_ID,
  MOCK_AUTH_CODE,
  MOCK_SESSION_ID,
  MOCK_SESSION_ID_RECONNECTED,
  getAllMockAccountUIDs,
  getAllMockAccountUIDsReconnected,
  getAllMockAccounts,
  getAllMockAccountsReconnected,
  getMockedASPSPData,
  getMockedAccountBalances,
  getMockedAccountDetails,
  getMockedTransactions,
} from './data';

/**
 * Track session state for testing reconnection scenarios
 * When sessionCounter > 0, return reconnected account UIDs
 */
let sessionCounter = 0;

/**
 * Reset session counter (call this before tests that need fresh state)
 */
const resetSessionCounter = () => {
  sessionCounter = 0;
};

/**
 * Increment session counter (simulates reauthorization)
 */
const incrementSessionCounter = () => {
  sessionCounter++;
};

/**
 * Enable Banking API mock handlers
 * Base URL: https://api.enablebanking.com
 */

const ENABLE_BANKING_BASE_URL = 'https://api.enablebanking.com';

/**
 * Check if request has valid authorization
 */
const hasValidAuth = (request: Request): boolean => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  // In a real implementation, we'd decode the JWT and check the app_id
  // For tests, we just check if there's a Bearer token
  return true;
};

/**
 * Mock: GET /application - Test connection
 */
const testConnectionHandler = http.get(`${ENABLE_BANKING_BASE_URL}/application`, ({ request }) => {
  if (!hasValidAuth(request)) {
    return new HttpResponse(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
  }

  return HttpResponse.json({
    app_id: 'test-app-id-12345',
    name: 'Test Application',
    created: new Date().toISOString(),
  });
});

/**
 * Mock: GET /aspsps - List all supported banks
 */
const getASPSPsHandler = http.get(`${ENABLE_BANKING_BASE_URL}/aspsps`, ({ request }) => {
  if (!hasValidAuth(request)) {
    return new HttpResponse(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
  }

  return HttpResponse.json({
    aspsps: getMockedASPSPData(),
  });
});

/**
 * Mock: POST /auth - Start authorization flow
 */
const startAuthorizationHandler = http.post(`${ENABLE_BANKING_BASE_URL}/auth`, async ({ request }) => {
  if (!hasValidAuth(request)) {
    return new HttpResponse(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await request.json()) as any;

  // Validate required fields
  if (!body.aspsp?.name || !body.aspsp?.country || !body.redirect_url) {
    return HttpResponse.json(
      {
        message: 'Missing required fields',
      },
      { status: 400 },
    );
  }

  // Return authorization response
  return HttpResponse.json({
    authorization_id: MOCK_AUTHORIZATION_ID,
    url: `https://bank.example.com/authorize?code=${MOCK_AUTH_CODE}&state=${body.state}`,
  });
});

/**
 * Mock: POST /sessions - Create session after OAuth
 * Returns full account objects (not just UIDs) as per Enable Banking API
 * Returns different account UIDs based on sessionCounter to simulate reconnection
 */
const createSessionHandler = http.post(`${ENABLE_BANKING_BASE_URL}/sessions`, async ({ request }) => {
  if (!hasValidAuth(request)) {
    return new HttpResponse(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await request.json()) as any;

  // Validate authorization code
  if (!body.code || body.code !== MOCK_AUTH_CODE) {
    return HttpResponse.json(
      {
        message: 'Invalid authorization code',
      },
      { status: 400 },
    );
  }

  // Increment counter to track session creation (for reconnection testing)
  sessionCounter++;

  // Return different session ID and full account objects based on whether this is a reconnection
  const isReconnection = sessionCounter > 1;
  const sessionId = isReconnection ? MOCK_SESSION_ID_RECONNECTED : MOCK_SESSION_ID;
  // createSession returns full account objects (with uid, currency, account_id, etc.)
  const accounts = isReconnection ? getAllMockAccountsReconnected() : getAllMockAccounts();

  return HttpResponse.json({
    session_id: sessionId,
    accounts,
  });
});

/**
 * Mock: GET /sessions/:sessionId - Get session details
 * Handles both original and reconnected session IDs
 */
const getSessionHandler = http.get(`${ENABLE_BANKING_BASE_URL}/sessions/:sessionId`, ({ request, params }) => {
  if (!hasValidAuth(request)) {
    return new HttpResponse(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
  }

  const { sessionId } = params;

  // Handle both original and reconnected session IDs
  if (sessionId === MOCK_SESSION_ID) {
    return HttpResponse.json({
      session_id: MOCK_SESSION_ID,
      accounts: getAllMockAccountUIDs(),
      created_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  if (sessionId === MOCK_SESSION_ID_RECONNECTED) {
    return HttpResponse.json({
      session_id: MOCK_SESSION_ID_RECONNECTED,
      accounts: getAllMockAccountUIDsReconnected(),
      created_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  return HttpResponse.json(
    {
      message: 'Session not found',
    },
    { status: 404 },
  );
});

/**
 * Mock: DELETE /sessions/:sessionId - Delete session
 */
const deleteSessionHandler = http.delete(`${ENABLE_BANKING_BASE_URL}/sessions/:sessionId`, ({ request }) => {
  if (!hasValidAuth(request)) {
    return new HttpResponse(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
  }

  return new HttpResponse(null, { status: 204 });
});

/**
 * Mock: GET /accounts/:accountId/details - Get account details
 */
const getAccountDetailsHandler = http.get(
  `${ENABLE_BANKING_BASE_URL}/accounts/:accountId/details`,
  ({ request, params }) => {
    if (!hasValidAuth(request)) {
      return new HttpResponse(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    const { accountId } = params as { accountId: string };

    const accountDetails = getMockedAccountDetails(accountId);

    return HttpResponse.json(accountDetails);
  },
);

/**
 * Mock: GET /accounts/:accountId/balances - Get account balances
 */
const getAccountBalancesHandler = http.get(
  `${ENABLE_BANKING_BASE_URL}/accounts/:accountId/balances`,
  ({ request, params }) => {
    if (!hasValidAuth(request)) {
      return new HttpResponse(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    const { accountId } = params as { accountId: string };

    const balances = getMockedAccountBalances(accountId);

    return HttpResponse.json({
      balances,
    });
  },
);

/**
 * Mock: GET /accounts/:accountId/transactions - Get transactions
 */
const getTransactionsHandler = http.get(
  `${ENABLE_BANKING_BASE_URL}/accounts/:accountId/transactions`,
  ({ request, params }) => {
    if (!hasValidAuth(request)) {
      return new HttpResponse(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    const { accountId } = params as { accountId: string };
    const url = new URL(request.url);

    // Parse pagination parameters
    const continuation_key = url.searchParams.get('continuation_key');

    // If there's a continuation key, return empty (end of pagination)
    if (continuation_key) {
      return HttpResponse.json({
        transactions: [],
      });
    }

    // Return mock transactions
    const transactions = getMockedTransactions(accountId, 10);

    return HttpResponse.json({
      transactions,
      continuation_key: null, // No more pages
    });
  },
);

/**
 * All Enable Banking mock handlers
 */
export const enableBankingHandlers = [
  testConnectionHandler,
  getASPSPsHandler,
  startAuthorizationHandler,
  createSessionHandler,
  getSessionHandler,
  deleteSessionHandler,
  getAccountDetailsHandler,
  getAccountBalancesHandler,
  getTransactionsHandler,
];

/**
 * Export individual handlers for custom test scenarios
 */
export {
  testConnectionHandler,
  getASPSPsHandler,
  startAuthorizationHandler,
  createSessionHandler,
  getSessionHandler,
  deleteSessionHandler,
  getAccountDetailsHandler,
  getAccountBalancesHandler,
  getTransactionsHandler,
  resetSessionCounter,
  incrementSessionCounter,
};
