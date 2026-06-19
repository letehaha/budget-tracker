/**
 * Predicates for "has this Map-step field been fully decided?" — i.e. a method
 * is chosen AND the decision that method requires is present (a CSV column for
 * column-based methods, an entity id for single-existing, both value lists for
 * transaction-type from-column).
 *
 * The Map step validity gate, the per-row status indicators, and the
 * "what's still missing" hint all need this exact judgement; defining it once
 * keeps them from disagreeing.
 *
 * Kept Vue/Pinia-free so it can be unit-tested in isolation.
 */
import {
  type AccountOption,
  AccountOptionValue,
  type CategoryOption,
  CategoryOptionValue,
  type CurrencyOption,
  CurrencyOptionValue,
  type TransactionTypeOption,
  TransactionTypeOptionValue,
} from '@bt/shared/types';

export function isCategoryDecided({ category }: { category: CategoryOption | null }): boolean {
  if (!category) return false;
  return category.option === CategoryOptionValue.existingCategory ? !!category.categoryId : !!category.columnName;
}

export function isAccountDecided({ account }: { account: AccountOption | null }): boolean {
  if (!account) return false;
  return account.option === AccountOptionValue.existingAccount ? !!account.accountId : !!account.columnName;
}

export function isCurrencyDecided({ currency }: { currency: CurrencyOption | null }): boolean {
  if (!currency) return false;
  return currency.option === CurrencyOptionValue.existingCurrency ? !!currency.currencyCode : !!currency.columnName;
}

export function isTransactionTypeDecided({ transactionType }: { transactionType: TransactionTypeOption }): boolean {
  // Amount-sign needs no further decision; from-column needs a column and both value lists.
  return transactionType.option === TransactionTypeOptionValue.amountSign
    ? true
    : !!transactionType.columnName &&
        transactionType.incomeValues.length > 0 &&
        transactionType.expenseValues.length > 0;
}
