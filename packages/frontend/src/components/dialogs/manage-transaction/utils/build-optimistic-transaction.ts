import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import type { TagModel, TransactionModel } from '@bt/shared/types';
import type { InfiniteData, QueryClient } from '@tanstack/vue-query';

import { getTxTypeFromFormType } from '../helpers';
import type { UI_FORM_STRUCT } from '../types';

interface BuildOptimisticTransactionParams {
  form: UI_FORM_STRUCT;
  transaction: TransactionModel;
  isRecordExternal: boolean;
}

/**
 * Builds an optimistically updated transaction from form data.
 * Only updates fields that can be changed via the edit form.
 */
export const buildOptimisticTransaction = ({
  form,
  transaction,
  isRecordExternal,
}: BuildOptimisticTransactionParams): TransactionModel => {
  const updatedTransaction: TransactionModel = {
    ...transaction,
    note: form.note ?? '',
    paymentType: form.paymentType.value,
    updatedAt: new Date(),
  };

  // Only update certain fields for non-external transactions
  if (!isRecordExternal) {
    updatedTransaction.amount = Number(form.amount);
    updatedTransaction.time = form.time;
    updatedTransaction.transactionType = getTxTypeFromFormType(form.type);
    updatedTransaction.accountId = form.account?.id ?? transaction.accountId;
  }

  // Update category if not a transfer
  if (form.category?.id) {
    updatedTransaction.categoryId = form.category.id;
  }

  // Update tags optimistically
  if (form.tagIds !== undefined) {
    updatedTransaction.tags = form.tagIds.map(
      (id): TagModel => ({
        id,
        userId: transaction.userId,
        name: '',
        color: '',
        icon: null,
        description: null,
        createdAt: new Date(),
      }),
    );
  }

  return updatedTransaction;
};

type TransactionPage = TransactionModel[];
type InfiniteTransactionData = InfiniteData<TransactionPage, unknown>;

interface OptimisticUpdateContext {
  previousQueries: Map<string, unknown>;
}

/**
 * Optimistically updates a transaction in all relevant Vue Query caches.
 * Returns a context object that can be used to rollback on error.
 */
export const applyOptimisticTransactionUpdate = ({
  queryClient,
  transactionId,
  updatedTransaction,
}: {
  queryClient: QueryClient;
  transactionId: number;
  updatedTransaction: TransactionModel;
}): OptimisticUpdateContext => {
  const previousQueries = new Map<string, unknown>();

  // Get all queries that might contain transactions
  const allQueries = queryClient.getQueryCache().getAll();

  // Filter to transaction-related queries (those with transactionChange prefix)
  const transactionQueries = allQueries.filter((query) => {
    const queryKey = query.queryKey;
    return Array.isArray(queryKey) && queryKey.some((key) => key === VUE_QUERY_GLOBAL_PREFIXES.transactionChange);
  });

  for (const query of transactionQueries) {
    const queryKey = query.queryKey;
    const queryKeyString = JSON.stringify(queryKey);
    const currentData = query.state.data;

    if (!currentData) continue;

    // Store previous data for rollback
    previousQueries.set(queryKeyString, structuredClone(currentData));

    // Handle infinite query data (paginated lists)
    if (isInfiniteQueryData(currentData)) {
      queryClient.setQueryData(queryKey, (oldData: InfiniteTransactionData | undefined) => {
        if (!oldData) return oldData;

        return {
          ...oldData,
          pages: oldData.pages.map((page) => page.map((tx) => (tx.id === transactionId ? updatedTransaction : tx))),
        };
      });
    }
    // Handle single transaction queries
    else if (isSingleTransaction(currentData)) {
      if (currentData.id === transactionId) {
        queryClient.setQueryData(queryKey, updatedTransaction);
      }
    }
    // Handle array of transactions (non-paginated)
    else if (isTransactionArray(currentData)) {
      queryClient.setQueryData(queryKey, (oldData: TransactionModel[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map((tx) => (tx.id === transactionId ? updatedTransaction : tx));
      });
    }
  }

  return { previousQueries };
};

/**
 * Rolls back optimistic updates using the stored previous query data.
 */
export const rollbackOptimisticUpdate = ({
  queryClient,
  context,
}: {
  queryClient: QueryClient;
  context: OptimisticUpdateContext;
}): void => {
  for (const [queryKeyString, previousData] of context.previousQueries) {
    const queryKey = JSON.parse(queryKeyString);
    queryClient.setQueryData(queryKey, previousData);
  }
};

// Type guards
function isInfiniteQueryData(data: unknown): data is InfiniteTransactionData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'pages' in data &&
    'pageParams' in data &&
    Array.isArray((data as InfiniteTransactionData).pages)
  );
}

function isSingleTransaction(data: unknown): data is TransactionModel {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'amount' in data &&
    'transactionType' in data &&
    !Array.isArray(data)
  );
}

function isTransactionArray(data: unknown): data is TransactionModel[] {
  if (!Array.isArray(data)) return false;
  // Empty arrays are valid transaction arrays - preserve them for rollback
  if (data.length === 0) return true;
  // Check first element to verify it's a transaction
  const first = data[0];
  return (
    typeof first === 'object' && first !== null && 'id' in first && 'amount' in first && 'transactionType' in first
  );
}
