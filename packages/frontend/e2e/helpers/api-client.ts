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

export async function apiDelete({ request, path, data }: { request: APIRequestContext; path: string; data?: unknown }) {
  const response = await request.delete(`${API_BASE_URL}${path}`, { ...(data !== undefined && { data }) });
  await assertOk({ response, label: `API DELETE ${path} failed` });
  // DELETE may return empty body
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
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

  // The /tests/* routes are only available when NODE_ENV is "test" or "development".
  // On preview (production), skip gracefully — email verification is not enforced there.
  if (response.status === 404) return;

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
  await dismissOnboarding({ request });
}

export async function dismissOnboarding({ request }: { request: APIRequestContext }): Promise<void> {
  await apiPut({
    request,
    path: '/api/v1/user/settings/onboarding',
    data: { isDismissed: true, dismissedAt: new Date().toISOString() },
  });
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

// ─── Categories ──────────────────────────────────────────────────────

async function apiGet({ request, path }: { request: APIRequestContext; path: string }) {
  const response = await request.get(`${API_BASE_URL}${path}`);
  await assertOk({ response, label: `API GET ${path} failed` });
  return response.json();
}

const categoryIdCache = new WeakMap<APIRequestContext, number>();

async function resolveDefaultCategoryId({ request }: { request: APIRequestContext }): Promise<number> {
  const cached = categoryIdCache.get(request);
  if (cached !== undefined) return cached;

  const result = await apiGet({ request, path: '/api/v1/categories' });
  const categories: Array<{ id: number }> = result.response ?? result;
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('No categories available for the test user');
  }
  const id = categories[0]!.id;
  categoryIdCache.set(request, id);
  return id;
}

// ─── Transactions ────────────────────────────────────────────────────

export async function createTransaction({
  request,
  accountId,
  amount,
  transactionType = 'expense',
  categoryId,
  transferNature = 'not_transfer',
}: {
  request: APIRequestContext;
  accountId: number;
  amount: number;
  transactionType?: 'expense' | 'income';
  categoryId?: number;
  transferNature?: 'not_transfer' | 'transfer_between_user_accounts' | 'transfer_out_wallet';
}) {
  const resolvedCategoryId = categoryId ?? (await resolveDefaultCategoryId({ request }));
  return apiPost({
    request,
    path: '/api/v1/transactions',
    data: {
      accountId,
      amount,
      transactionType,
      categoryId: resolvedCategoryId,
      transferNature,
      paymentType: 'creditCard',
      time: new Date().toISOString(),
    },
  });
}

export async function linkTransactions({
  request,
  ids,
}: {
  request: APIRequestContext;
  ids: [baseTxId: number, oppositeTxId: number][];
}) {
  return apiPut({
    request,
    path: '/api/v1/transactions/link',
    data: { ids },
  });
}

export async function linkTransactionToPortfolio({
  request,
  transactionId,
  portfolioId,
}: {
  request: APIRequestContext;
  transactionId: number;
  portfolioId: number;
}) {
  return apiPost({
    request,
    path: `/api/v1/transactions/${transactionId}/link-to-portfolio`,
    data: { portfolioId },
  });
}

// ─── Transaction Groups ─────────────────────────────────────────────

export async function createTransactionGroup({
  request,
  name,
  transactionIds,
  note,
}: {
  request: APIRequestContext;
  name: string;
  transactionIds: number[];
  note?: string | null;
}) {
  return apiPost({
    request,
    path: '/api/v1/transaction-groups',
    data: { name, transactionIds, ...(note !== undefined && { note }) },
  });
}

export async function addTransactionsToGroup({
  request,
  groupId,
  transactionIds,
}: {
  request: APIRequestContext;
  groupId: number;
  transactionIds: number[];
}) {
  return apiPost({
    request,
    path: `/api/v1/transaction-groups/${groupId}/transactions`,
    data: { transactionIds },
  });
}

// ─── Payment Reminders ──────────────────────────────────────────────

export async function createPaymentReminder({
  request,
  name,
  dueDate,
  frequency,
  expectedAmount,
  currencyCode,
  remindBefore,
}: {
  request: APIRequestContext;
  name: string;
  dueDate: string;
  frequency?: string;
  expectedAmount?: number;
  currencyCode?: string;
  remindBefore?: string[];
}) {
  return apiPost({
    request,
    path: '/api/v1/payment-reminders',
    data: {
      name,
      dueDate,
      ...(frequency && { frequency }),
      ...(expectedAmount !== undefined && { expectedAmount }),
      ...(currencyCode && { currencyCode }),
      ...(remindBefore && { remindBefore }),
      timezone: 'UTC',
    },
  });
}

export async function markReminderPeriodPaid({
  request,
  reminderId,
  periodId,
  transactionId,
}: {
  request: APIRequestContext;
  reminderId: string;
  periodId: string;
  transactionId?: number;
}) {
  return apiPost({
    request,
    path: `/api/v1/payment-reminders/${reminderId}/periods/${periodId}/pay`,
    data: transactionId !== undefined ? { transactionId } : {},
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
