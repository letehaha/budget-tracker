import { API_ERROR_CODES } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';

/**
 * Awaits a query that may return null, and throws NotFoundError if the result is null.
 *
 * `code`/`details` flow into the error envelope so callers can attach a
 * machine-readable error code the client can branch on.
 *
 * @example
 * const tag = await findOrThrowNotFound(
 *   Tags.findOne({ where: { id, userId } }),
 *   { message: t({ key: 'tags.tagNotFound' }) },
 * );
 *
 * const account = await findOrThrowNotFound(
 *   Accounts.findByPk(accountId),
 *   { message: 'Account not found' },
 * );
 */
export async function findOrThrowNotFound<T>({
  query,
  message,
  code,
  details,
}: {
  query: Promise<T | null>;
  message: string;
  code?: API_ERROR_CODES;
  details?: Record<string, unknown>;
}): Promise<T> {
  const result = await query;

  if (!result) {
    throw new NotFoundError({ message, code, details });
  }

  return result;
}
