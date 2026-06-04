import { AccountModel, CATEGORIZATION_SOURCE, FILTER_OPERATION, TRANSACTION_TYPES } from '@bt/shared/types';

export interface FiltersStruct {
  start: Date | undefined; // ISO date
  end: Date | undefined; // ISO date
  transactionType: TRANSACTION_TYPES | null;
  amountGte: number | undefined;
  amountLte: number | undefined;
  transferFilter: FILTER_OPERATION;
  refundFilter: FILTER_OPERATION;
  accounts: AccountModel[];
  budgetIds?: string[] | null;
  excludedBudgetIds?: string[] | null;
  noteIncludes: string;
  categoryIds: string[];
  tagIds: string[];
  payeeIds: string[];
  categorizationSource: CATEGORIZATION_SOURCE | null;
}

export const DEFAULT_FILTERS: FiltersStruct = {
  start: undefined,
  end: undefined,
  transactionType: null,
  amountGte: undefined,
  amountLte: undefined,
  transferFilter: FILTER_OPERATION.all,
  refundFilter: FILTER_OPERATION.all,
  accounts: [],
  excludedBudgetIds: null,
  noteIncludes: '',
  categoryIds: [],
  tagIds: [],
  payeeIds: [],
  categorizationSource: null,
};
