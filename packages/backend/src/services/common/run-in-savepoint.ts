import { connection } from '@models/connection';
import { UniqueConstraintError } from 'sequelize';

/**
 * Run `fn` inside a Postgres SAVEPOINT. A failed statement aborts the whole
 * surrounding transaction; a savepoint scopes the rollback to `fn`, keeping the
 * enclosing transaction usable. One line suffices because `Sequelize.useCLS`
 * makes `sequelize.transaction()` open a savepoint when a transaction is
 * already active on the async context (a plain transaction otherwise).
 */
export function runInSavepoint<T>(fn: () => Promise<T>): Promise<T> {
  return connection.sequelize.transaction(() => fn());
}

/**
 * Insert a row that may lose a UNIQUE-index race, inside a shared transaction.
 * `insert` runs in a savepoint; on `UniqueConstraintError` only the savepoint
 * rolls back and `adopt` re-reads the winner's row (visible by then — Postgres
 * surfaces the violation only after the winner committed). A bare
 * `findOrCreate`/try-catch is unsafe here: its recovery read would run in the
 * already-aborted transaction.
 */
export async function insertOrAdopt<T>({
  insert,
  adopt,
}: {
  insert: () => Promise<T>;
  adopt: () => Promise<T | null>;
}): Promise<T> {
  try {
    return await runInSavepoint(insert);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const existing = await adopt();
      if (existing) return existing;
    }
    throw error;
  }
}
