import { connection, namespace } from '@models/index';

export const isTransactionActive = () => {
  return !!namespace.get('transaction');
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
