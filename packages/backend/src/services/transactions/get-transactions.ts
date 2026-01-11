import * as Transactions from '@models/Transactions.model';

import { withTransaction } from '../common/with-transaction';

export const getTransactions = withTransaction(
  async (params: Omit<Parameters<typeof Transactions.findWithFilters>[0], 'isRaw'>) => {
    // When includeSplits or includeTags is true, we need nested data (not raw) to preserve array structure
    // Raw mode flattens nested includes into dot-notation keys which breaks access
    const isRaw = !params.includeSplits && !params.includeTags;
    const data = await Transactions.findWithFilters({ ...params, isRaw });

    return data;
  },
);
