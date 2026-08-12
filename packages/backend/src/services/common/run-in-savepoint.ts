import { connection, namespace } from '@models/connection';
import { UniqueConstraintError } from 'sequelize';

/**
 * Run `fn` inside a Postgres SAVEPOINT. A failed statement aborts the whole
 * surrounding transaction; a savepoint scopes the rollback to `fn`, keeping the
 * enclosing transaction usable. The ambient transaction must be passed
 * explicitly: CLS injects it into queries but not into `sequelize.transaction()`,
 * which would otherwise open an independent transaction on a second connection
 * and deadlock against row locks the ambient transaction already holds.
 */
export function runInSavepoint<T>(fn: () => Promise<T>): Promise<T> {
  const ambient = namespace.get('transaction');
  const options = ambient && !ambient.finished ? { transaction: ambient } : {};
  return connection.sequelize.transaction(options, () => fn());
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
