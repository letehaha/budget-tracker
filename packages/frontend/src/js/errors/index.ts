import { ApiBaseError } from '@/common/types';
import { API_ERROR_CODES } from '@bt/shared/types';

export * from './network.error';
export * from './auth.error';
export * from './unexpected.error';

export class ApiErrorResponseError extends Error {
  data: ApiBaseError;

  constructor(message: string, data: ApiBaseError) {
    super(message);

    this.data = data;
  }
}

export const isNotFoundError = (error: unknown): error is ApiErrorResponseError =>
  error instanceof ApiErrorResponseError && error.data?.code === API_ERROR_CODES.notFound;

/**
 * Detects whether every Zod validation failure on the response originated from
 * a URL path/query param (e.g. `params.id`) rather than the request body.
 * A request that fails purely on URL params never reaches the resource, which
 * is UX-equivalent to a 404 for that URL.
 */
const isPurelyUrlParamValidationError = (error: ApiErrorResponseError): boolean => {
  if (error.data?.code !== API_ERROR_CODES.validationError) return false;
  const validationErrors = (error.data as unknown as Record<string, unknown>)?.validationErrors;
  if (!Array.isArray(validationErrors) || validationErrors.length === 0) return false;
  return validationErrors.every((v) => {
    const path = (v as { path?: unknown }).path;
    return Array.isArray(path) && (path[0] === 'params' || path[0] === 'query');
  });
};

/**
 * Treats both a real NotFound and a URL-param validation failure as "resource
 * unavailable for this URL." Page-level resource fetches (e.g. `/portfolios/:id`)
 * should use this to render an empty/not-found state for any URL that can't
 * resolve to a real record — including malformed IDs typed into the address bar.
 *
 * Body-level validation errors (mutations, form submits) are NOT covered here —
 * those should keep producing field-level error UI, not a "not found" page.
 */
export const isResourceMissingError = (error: unknown): error is ApiErrorResponseError => {
  if (!(error instanceof ApiErrorResponseError)) return false;
  if (error.data?.code === API_ERROR_CODES.notFound) return true;
  return isPurelyUrlParamValidationError(error);
};

/**
 * Extracts the first validation error message from an ApiErrorResponseError.
 * Returns undefined if the error is not a validation error or has no messages.
 */
const getFirstValidationMessage = ({ error }: { error: ApiErrorResponseError }): string | undefined => {
  const validationErrors = (error.data as unknown as Record<string, unknown>)?.validationErrors;
  if (Array.isArray(validationErrors) && validationErrors[0]?.message) {
    return validationErrors[0].message as string;
  }
  return undefined;
};

/**
 * Maps an API error to a user-facing message.
 * - Conflict errors use the provided conflictKey
 * - Validation errors extract the first Zod validation message
 * - Everything else uses the fallbackKey
 */
export const getApiErrorMessage = ({
  e,
  t,
  conflictKey,
  fallbackKey,
}: {
  e: unknown;
  t: (key: string) => string;
  conflictKey: string;
  fallbackKey: string;
}): string => {
  if (e instanceof ApiErrorResponseError) {
    if (e.data?.code === API_ERROR_CODES.conflict) {
      return t(conflictKey);
    }
    if (e.data?.code === API_ERROR_CODES.validationError) {
      return getFirstValidationMessage({ error: e }) || t(fallbackKey);
    }
  }
  return t(fallbackKey);
};
