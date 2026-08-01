import { CategoryForCategorization, TransactionForCategorization } from '../types';

/**
 * Alias ids sent to the model in place of UUIDs, plus lookup maps to translate
 * its answer back. A UUID costs ~20 tokens while "t42" costs 2, and every
 * transaction carries one in the prompt and two in the response.
 */
interface ShortIdMapping {
  aliasedTransactions: TransactionForCategorization[];
  aliasedCategories: CategoryForCategorization[];
  transactionIdByAlias: Map<string, string>;
  categoryIdByAlias: Map<string, string>;
}

/**
 * Replace transaction and category UUIDs with "t1"/"c1" aliases, numbered in
 * input order. The prefixes keep the two namespaces disjoint, so a line with
 * swapped sides fails validation instead of silently mis-applying.
 */
export function assignShortIds({
  transactions,
  categories,
}: {
  transactions: TransactionForCategorization[];
  categories: CategoryForCategorization[];
}): ShortIdMapping {
  const transactionIdByAlias = new Map<string, string>();
  const categoryIdByAlias = new Map<string, string>();
  const categoryAliasById = new Map<string, string>();

  categories.forEach((category, index) => {
    const alias = `c${index + 1}`;
    categoryIdByAlias.set(alias, category.id);
    categoryAliasById.set(category.id, alias);
  });

  const aliasedTransactions = transactions.map((transaction, index) => {
    const alias = `t${index + 1}`;
    transactionIdByAlias.set(alias, transaction.id);
    return { ...transaction, id: alias };
  });

  const aliasedCategories = categories.map((category) => ({
    ...category,
    id: categoryAliasById.get(category.id)!,
    // A parent outside the list has no alias; presenting the category as
    // top-level beats leaking a raw UUID into the prompt.
    parentId: category.parentId ? (categoryAliasById.get(category.parentId) ?? null) : null,
  }));

  return { aliasedTransactions, aliasedCategories, transactionIdByAlias, categoryIdByAlias };
}
