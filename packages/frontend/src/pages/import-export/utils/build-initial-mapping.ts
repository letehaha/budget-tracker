/**
 * Pure, dependency-free builder that turns an automatic column-match result
 * (from `auto-match.ts`) into the wizard's initial working column mapping.
 *
 * Method inference:
 *   - simple fields (date/amount/description) take the matched column name
 *   - category/account/currency adopt a per-value / from-column method when a
 *     column matched, otherwise stay unset (`null`) so the UI flags them as
 *     "needs attention"
 *   - transaction type adopts the from-column method (pre-filling income/expense
 *     values from observed distinct values) when a type column matched, otherwise
 *     defaults to amount-sign
 *
 * Kept Pinia/Vue-free so it can be unit-tested in isolation and reused anywhere.
 */
import {
  type AccountOption,
  AccountOptionValue,
  type CategoryOption,
  CategoryOptionValue,
  type CurrencyOption,
  CurrencyOptionValue,
  type TagOption,
  type TransactionTypeOption,
  TransactionTypeOptionValue,
} from '@bt/shared/types';

import { type ColumnMatchResult, classifyTransactionTypeValues } from './auto-match';

/**
 * The wizard's working column mapping.
 *
 * Distinct from `ColumnMappingConfig` (the always-complete wire payload sent to
 * the backend): here the assignment-method fields can be `null` to express
 * "not chosen yet", which the Map step renders as a "needs attention" row.
 * `csv-import` projects this onto `ColumnMappingConfig` (asserting non-null)
 * only once `isMapStepValid` passes.
 */
export interface ColumnMapping {
  /** Matched date column header, or `null` when no column matched. */
  date: string | null;
  /** Matched amount column header, or `null` when no column matched. */
  amount: string | null;
  /** Matched description column header, or `null` when none matched (optional field). */
  description: string | null;
  /** `null` until the user picks a category assignment method. */
  category: CategoryOption | null;
  /** `null` means no tags column is mapped (optional field). */
  tags: TagOption | null;
  /** `null` until the user picks an account assignment method. */
  account: AccountOption | null;
  /** `null` until the user picks a currency assignment method. */
  currency: CurrencyOption | null;
  /** Always set: defaults to amount-sign when no type column matched. */
  transactionType: TransactionTypeOption;
}

/** Returns the distinct, defined string values of `column` across all preview rows. */
function distinctColumnValues({ column, preview }: { column: string; preview: Record<string, string>[] }): string[] {
  const seen = new Set<string>();

  for (const row of preview) {
    const value = row[column];
    // Treat empty cells as absent — they carry no income/expense signal.
    if (value !== undefined && value !== '') {
      seen.add(value);
    }
  }

  return [...seen];
}

/**
 * Builds the starting `ColumnMapping` from a column-match result and CSV preview.
 *
 * Matched simple fields take the column header; matched complex fields adopt the
 * inferred method; unmatched complex fields stay `null` ("needs attention").
 * Transaction type pre-fills income/expense values by classifying the distinct
 * values of the matched type column over `preview`.
 */
export function buildInitialColumnMapping({
  matchResult,
  preview,
}: {
  matchResult: ColumnMatchResult;
  preview: Record<string, string>[];
}): ColumnMapping {
  const category: CategoryOption | null = matchResult.category
    ? { option: CategoryOptionValue.mapDataSourceColumn, columnName: matchResult.category.column }
    : null;

  const account: AccountOption | null = matchResult.account
    ? { option: AccountOptionValue.dataSourceColumn, columnName: matchResult.account.column }
    : null;

  const currency: CurrencyOption | null = matchResult.currency
    ? { option: CurrencyOptionValue.dataSourceColumn, columnName: matchResult.currency.column }
    : null;

  let transactionType: TransactionTypeOption;
  if (matchResult.transactionType) {
    const { income, expense } = classifyTransactionTypeValues({
      distinctValues: distinctColumnValues({ column: matchResult.transactionType.column, preview }),
    });
    transactionType = {
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: matchResult.transactionType.column,
      incomeValues: income,
      expenseValues: expense,
    };
  } else {
    transactionType = { option: TransactionTypeOptionValue.amountSign };
  }

  return {
    date: matchResult.date?.column ?? null,
    amount: matchResult.amount?.column ?? null,
    description: matchResult.description?.column ?? null,
    category,
    // Tags stay unset on initial build; the user opts in via the Map step.
    tags: null,
    account,
    currency,
    transactionType,
  };
}
