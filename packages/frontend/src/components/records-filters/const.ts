import { AccountModel, CATEGORIZATION_SOURCE, TRANSACTION_TYPES } from '@bt/shared/types';

export interface FiltersStruct {
  start: Date | undefined; // ISO date
  end: Date | undefined; // ISO date
  transactionType: TRANSACTION_TYPES | null;
  amountGte: number | undefined;
  amountLte: number | undefined;
  excludeRefunds: boolean;
  excludeTransfer: boolean;
  accounts: AccountModel[];
  budgetIds?: number[] | null;
  excludedBudgetIds?: number[] | null;
  noteIncludes: string;
  categoryIds: number[];
  tagIds: number[];
  categorizationSource: CATEGORIZATION_SOURCE | null;
}

export const DEFAULT_FILTERS: FiltersStruct = {
  start: undefined,
  end: undefined,
  transactionType: null,
  amountGte: undefined,
  amountLte: undefined,
  excludeRefunds: false,
  excludeTransfer: false,
  accounts: [],
  excludedBudgetIds: null,
  noteIncludes: '',
  categoryIds: [],
  tagIds: [],
  categorizationSource: null,
};
