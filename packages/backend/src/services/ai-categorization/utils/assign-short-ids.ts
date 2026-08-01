import { CategoryForCategorization, TransactionForCategorization } from '../types';

/** Aliases sent to the model in place of UUIDs, plus maps to translate its answer back. */
interface ShortIdMapping {
  aliasedTransactions: TransactionForCategorization[];
  aliasedCategories: CategoryForCategorization[];
  transactionIdByAlias: Map<string, string>;
  categoryIdByAlias: Map<string, string>;
}

/**
 * Replace UUIDs with "t1"/"c1" aliases numbered in input order. A UUID costs ~20
 * tokens and each transaction carries three of them per run. The distinct prefixes
 * keep the namespaces disjoint, so a line with swapped sides fails validation.
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
