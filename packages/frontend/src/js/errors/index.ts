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
