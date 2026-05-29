import { connection } from '@models/index';

type AsyncFunction<T extends unknown[], R> = (...args: T) => Promise<R>;

/**
 * Wraps an async function in a Sequelize managed transaction.
 * In Sequelize v7, managed transactions use AsyncLocalStorage internally.
 * If called within an existing transaction, a savepoint is created automatically.
 */
export function withTransaction<T extends unknown[], R>(fn: AsyncFunction<T, R>, params = {}): AsyncFunction<T, R> {
  return async (...args: T): Promise<R> => {
    return connection.sequelize.transaction(async () => {
      return fn(...args);
    }, params);
  };
}
