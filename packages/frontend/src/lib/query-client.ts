import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { ApiErrorResponseError, AuthError, UnexpectedError } from '@/js/errors';
import { API_ERROR_CODES } from '@bt/shared/types';
import { QueryClient, type QueryKey } from '@tanstack/vue-query';

import { persistedQueryFn } from './query-persister';

// Client-terminal codes: the caller cannot fix by retrying (auth/permission
// gaps, missing resources, malformed requests). Transient codes like
// tooManyRequests and badGateway are intentionally absent so they stay retryable.
const NON_RETRYABLE_API_CODES: ReadonlySet<API_ERROR_CODES> = new Set([
  API_ERROR_CODES.forbidden,
  API_ERROR_CODES.notFound,
  API_ERROR_CODES.notAllowed,
  API_ERROR_CODES.BadRequest,
  API_ERROR_CODES.validationError,
  API_ERROR_CODES.conflict,
  API_ERROR_CODES.invalidCredentials,
  API_ERROR_CODES.userExists,
  API_ERROR_CODES.categoryHasTransactions,
  API_ERROR_CODES.locked,
  API_ERROR_CODES.baseCurrencyChangeInProgress,
  API_ERROR_CODES.payloadTooLarge,
  API_ERROR_CODES.currencyNotConnected,
]);

const DEFAULT_MAX_RETRIES = 3;

export const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  if (error instanceof AuthError) return false;
  if (error instanceof UnexpectedError) return false;

  if (error instanceof ApiErrorResponseError) {
    return !NON_RETRYABLE_API_CODES.has(error.data.code) && failureCount < DEFAULT_MAX_RETRIES;
  }

  return failureCount < DEFAULT_MAX_RETRIES;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
    },
  },
});

// Rarely-changing, non-financial queries that are safe to restore instantly from
// disk on reload (stale-while-revalidate: cached data shows immediately while a
// background refetch runs). Volatile data — transactions, balances, cash-flow,
// stats, notifications, sync status — is intentionally excluded.
//
// Keys are matched by PREFIX, so filtered variants (e.g. subscriptions with a
// filter suffix) are covered by their stable base key. Each prefix is chosen to
// avoid overlapping a volatile sibling under the same global prefix.
const PERSISTED_QUERY_KEY_PREFIXES: readonly QueryKey[] = [
  // Static reference data
  VUE_QUERY_CACHE_KEYS.allCurrencies,
  VUE_QUERY_CACHE_KEYS.userCurrencies,
  VUE_QUERY_CACHE_KEYS.baseCurrency,
  VUE_QUERY_CACHE_KEYS.categoriesList,
  VUE_QUERY_CACHE_KEYS.userSettings,
  VUE_QUERY_CACHE_KEYS.accountGroups,
  VUE_QUERY_CACHE_KEYS.exchangeRates,
  VUE_QUERY_CACHE_KEYS.earliestTransactionDate,
  // Slow-to-load list endpoints (list only, not per-item detail/summary)
  VUE_QUERY_CACHE_KEYS.allAccounts,
  VUE_QUERY_CACHE_KEYS.portfoliosList,
  VUE_QUERY_CACHE_KEYS.loansList,
  VUE_QUERY_CACHE_KEYS.subscriptionsList,
];

// Attach the persister centrally via query defaults so individual useQuery call
// sites stay untouched. Per-call options still win over these defaults, and no
// whitelisted call site sets its own `persister`.
if (persistedQueryFn) {
  for (const queryKey of PERSISTED_QUERY_KEY_PREFIXES) {
    queryClient.setQueryDefaults(queryKey, { persister: persistedQueryFn });
  }
}
