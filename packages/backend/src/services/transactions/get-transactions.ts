import * as Transactions from '@models/transactions.model';

export const getTransactions = async (params: Omit<Parameters<typeof Transactions.findWithFilters>[0], 'isRaw'>) => {
  // When includeSplits, includeTags, or includeGroups is true, we need nested data (not raw) to preserve array structure
  // Raw mode flattens nested includes into dot-notation keys which breaks access
  const isRaw = !params.includeSplits && !params.includeTags && !params.includeGroups;
  return Transactions.findWithFilters({ ...params, isRaw });
};
