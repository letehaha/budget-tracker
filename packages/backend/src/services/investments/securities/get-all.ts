import Securities from '@models/investments/Securities.model';
import { withTransaction } from '@services/common/with-transaction';
import { FindOptions } from 'sequelize';

/**
 * Fetches a list of securities from the database.
 * @param options - Sequelize find options.
 */
const getSecuritiesImpl = async (options: FindOptions = {}) => {
  return Securities.findAll(options);
};

export const getSecurities = withTransaction(getSecuritiesImpl);
