import type { APIRequestContext } from '@playwright/test';

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || 'https://localhost:8081';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://localhost:8100';

export { API_BASE_URL, BASE_URL };

// ─── Generic request helpers ─────────────────────────────────────────

async function assertOk({
  response,
  label,
}: {
  response: { ok(): boolean; status(): number; text(): Promise<string> };
  label: string;
}): Promise<void> {
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`${label}: ${response.status()} ${body}`);
  }
}

export async function apiPost({ request, path, data }: { request: APIRequestContext; path: string; data: unknown }) {
  const response = await request.post(`${API_BASE_URL}${path}`, { data });
  await assertOk({ response, label: `API POST ${path} failed` });
  return response.json();
}

export async function apiPut({ request, path, data }: { request: APIRequestContext; path: string; data: unknown }) {
  const response = await request.put(`${API_BASE_URL}${path}`, { data });
  await assertOk({ response, label: `API PUT ${path} failed` });
  return response.json();
}

// ─── Auth ────────────────────────────────────────────────────────────

/**
 * Creates an authenticated API request context by signing up a fresh user.
 * Sign-up returns session cookies directly, avoiding email-verification issues.
 */
export async function createAuthenticatedApiContext({
  playwright,
  email,
  password,
  name,
}: {
  playwright: { request: { newContext: (options: Record<string, unknown>) => Promise<APIRequestContext> } };
  email: string;
  password: string;
  name: string;
}): Promise<APIRequestContext> {
  const request = await playwright.request.newContext({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Origin: BASE_URL },
  });

  await apiPost({
    request,
    path: '/api/v1/auth/sign-up/email',
    data: { email, password, name },
  });

  return request;
}

export async function signUpViaFetch({
  email,
  password,
  name,
}: {
  email: string;
  password: string;
  name: string;
}): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email, password, name }),
  });

  if (!response.ok) {
    throw new Error(`Sign-up failed: ${response.status} ${await response.text()}`);
  }
}

export async function verifyEmailViaFetch({ email }: { email: string }): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/tests/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error(`Email verification failed: ${response.status} ${await response.text()}`);
  }
}

export async function verifyEmail({ request, email }: { request: APIRequestContext; email: string }) {
  return apiPost({ request, path: '/api/v1/tests/verify-email', data: { email } });
}

// ─── User / Currency ─────────────────────────────────────────────────

export async function setBaseCurrency({ request, currencyCode }: { request: APIRequestContext; currencyCode: string }) {
  return apiPost({ request, path: '/api/v1/user/currencies/base', data: { currencyCode } });
}

export async function addUserCurrencies({
  request,
  currencyCode,
}: {
  request: APIRequestContext;
  currencyCode: string;
}) {
  return apiPost({
    request,
    path: '/api/v1/user/currencies',
    data: { currencies: [{ currencyCode }] },
  });
}

/**
 * Completes onboarding by setting the base currency and adding it to the user's list.
 */
export async function completeOnboarding({
  request,
  currencyCode,
}: {
  request: APIRequestContext;
  currencyCode: string;
}): Promise<void> {
  await setBaseCurrency({ request, currencyCode });
  await addUserCurrencies({ request, currencyCode });
}

// ─── Accounts ────────────────────────────────────────────────────────

export async function createAccount({
  request,
  name,
  currencyCode,
  initialBalance,
}: {
  request: APIRequestContext;
  name: string;
  currencyCode: string;
  initialBalance: number;
}) {
  return apiPost({
    request,
    path: '/api/v1/accounts',
    data: {
      name,
      currencyCode,
      initialBalance,
      creditLimit: 0,
      accountCategory: 'general',
    },
  });
}

// ─── Portfolios ──────────────────────────────────────────────────────

export async function createPortfolio({ request, name }: { request: APIRequestContext; name: string }) {
  return apiPost({ request, path: '/api/v1/investments/portfolios', data: { name } });
}

export async function setPortfolioCash({
  request,
  portfolioId,
  currencyCode,
  amount,
}: {
  request: APIRequestContext;
  portfolioId: number;
  currencyCode: string;
  amount: string;
}) {
  return apiPut({
    request,
    path: `/api/v1/investments/portfolios/${portfolioId}/balance`,
    data: { currencyCode, setAvailableCash: amount },
  });
}

// ─── Holdings ────────────────────────────────────────────────────────

export async function createHolding({
  request,
  portfolioId,
  searchResult,
}: {
  request: APIRequestContext;
  portfolioId: number;
  searchResult: {
    symbol: string;
    name: string;
    assetClass: string;
    providerName: string;
    currencyCode: string;
    exchangeAcronym?: string;
    exchangeMic?: string;
    exchangeName?: string;
  };
}) {
  return apiPost({
    request,
    path: '/api/v1/investments/holding',
    data: { portfolioId, searchResult },
  });
}
