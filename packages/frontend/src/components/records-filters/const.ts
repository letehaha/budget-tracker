import { AccountModel, CATEGORIZATION_SOURCE, TRANSACTION_TYPES } from '@bt/shared/types';

export interface FiltersStruct {
  start: Date | null; // ISO date
  end: Date | null; // ISO date
  transactionType: TRANSACTION_TYPES;
  amountGte: number | null;
  amountLte: number | null;
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
  start: null,
  end: null,
  transactionType: null,
  amountGte: null,
  amountLte: null,
  excludeRefunds: false,
  excludeTransfer: false,
  accounts: [],
  excludedBudgetIds: null,
  noteIncludes: '',
  categoryIds: [],
  tagIds: [],
  categorizationSource: null,
};
