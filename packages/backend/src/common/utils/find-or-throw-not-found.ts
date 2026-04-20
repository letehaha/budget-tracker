import { NotFoundError } from '@js/errors';

/**
 * Awaits a query that may return null, and throws NotFoundError if the result is null.
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
}: {
  query: Promise<T | null>;
  message: string;
}): Promise<T> {
  const result = await query;

  if (!result) {
    throw new NotFoundError({ message });
  }

  return result;
}
