import { connection, namespace } from '@models/index';

const isTransactionActive = () => {
  const transaction = namespace.get('transaction');
  // Check both that a transaction exists AND that it hasn't already been
  // committed/rolled back. Stale transactions can remain in the CLS namespace
  // when cls-hooked doesn't perfectly restore async context (e.g. in test
  // environments with supertest where requests share the same process).
  return !!transaction && !transaction.finished;
};

type AsyncFunction<T extends unknown[], R> = (...args: T) => Promise<R>;

export function withTransaction<T extends unknown[], R>(fn: AsyncFunction<T, R>, params = {}): AsyncFunction<T, R> {
  return async (...args: T): Promise<R> => {
    if (isTransactionActive()) {
      return fn(...args);
    } else {
      return connection.sequelize.transaction(async () => {
        return fn(...args);
      }, params);
    }
  };
}
