import {
  AccountModel,
  CATEGORIZATION_SOURCE,
  FILTER_OPERATION,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';

/** Transfer kinds the user can narrow down to via the "Transfer nature" filter. */
export const SELECTABLE_TRANSFER_NATURES = [
  TRANSACTION_TRANSFER_NATURE.common_transfer,
  TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
  TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
  TRANSACTION_TRANSFER_NATURE.transfer_to_venture,
] as const;

export interface FiltersStruct {
  start: Date | undefined; // ISO date
  end: Date | undefined; // ISO date
  transactionType: TRANSACTION_TYPES | null;
  amountGte: number | undefined;
  amountLte: number | undefined;
  transferFilter: FILTER_OPERATION;
  refundFilter: FILTER_OPERATION;
  /** Which transfer kinds to include. All selected = no narrowing. */
  transferNatures: TRANSACTION_TRANSFER_NATURE[];
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
  transferNatures: [...SELECTABLE_TRANSFER_NATURES],
  accounts: [],
  excludedBudgetIds: null,
  noteIncludes: '',
  categoryIds: [],
  tagIds: [],
  payeeIds: [],
  categorizationSource: null,
};
