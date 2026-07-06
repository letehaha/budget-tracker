import { ApiErrorResponseError, AuthError, UnexpectedError } from '@/js/errors';
import { API_ERROR_CODES } from '@bt/shared/types';
import { QueryClient } from '@tanstack/vue-query';

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
