import Securities from '@models/investments/securities.model';
import { FindOptions } from '@sequelize/core';
import { withTransaction } from '@services/common/with-transaction';

/**
 * Fetches a list of securities from the database.
 * @param options - Sequelize find options.
 */
const getSecuritiesImpl = async (options: FindOptions = {}) => {
  return Securities.findAll(options);
};

export const getSecurities = withTransaction(getSecuritiesImpl);
