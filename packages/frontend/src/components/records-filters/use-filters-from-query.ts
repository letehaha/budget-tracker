import { FiltersStruct } from '@/components/records-filters/const';
import { useAccountsStore } from '@/stores';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { parseISO } from 'date-fns';
import { storeToRefs } from 'pinia';
import { LocationQuery } from 'vue-router';

/**
 * Parses route query parameters into a partial FiltersStruct.
 * Returns only the filters that are present in the query.
 */
export const useFiltersFromQuery = () => {
  const accountsStore = useAccountsStore();
  const { accounts: storeAccounts } = storeToRefs(accountsStore);

  const parseFiltersFromQuery = ({ query }: { query: LocationQuery }): Partial<FiltersStruct> | null => {
    if (Object.keys(query).length === 0) {
      return null;
    }

    const filters: Partial<FiltersStruct> = {};

    if (query.categoryIds) {
      filters.categoryIds = Array.isArray(query.categoryIds)
        ? query.categoryIds.map((id) => Number(id))
        : [Number(query.categoryIds)];
    }

    if (query.accountIds) {
      const accountIds = Array.isArray(query.accountIds)
        ? query.accountIds.map((id) => Number(id))
        : [Number(query.accountIds)];

      filters.accounts = storeAccounts.value.filter((account) => accountIds.includes(account.id));
    }

    if (query.start) {
      filters.start = parseISO(query.start as string);
    }

    if (query.end) {
      filters.end = parseISO(query.end as string);
    }

    if (query.transactionType) {
      const type = query.transactionType as string;
      if (Object.values(TRANSACTION_TYPES).includes(type as TRANSACTION_TYPES)) {
        filters.transactionType = type as TRANSACTION_TYPES;
      }
    }

    if (query.amountGte) {
      filters.amountGte = Number(query.amountGte);
    }

    if (query.amountLte) {
      filters.amountLte = Number(query.amountLte);
    }

    if (query.noteIncludes) {
      filters.noteIncludes = query.noteIncludes as string;
    }

    if (query.excludeRefunds) {
      filters.excludeRefunds = query.excludeRefunds === 'true';
    }

    if (query.excludeTransfer) {
      filters.excludeTransfer = query.excludeTransfer === 'true';
    }

    return Object.keys(filters).length > 0 ? filters : null;
  };

  return { parseFiltersFromQuery };
};
