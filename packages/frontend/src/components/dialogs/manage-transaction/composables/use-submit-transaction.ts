import { createTransaction, editTransaction, linkTransactions } from '@/api';
import { OUT_OF_WALLET_ACCOUNT_MOCK, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { getInvalidationQueryKey } from '@/composable/data-queries/opposite-tx-record';
import { i18n } from '@/i18n';
import { ApiErrorResponseError } from '@/js/errors';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { useOnboardingStore } from '@/stores/onboarding';
import type { TransactionModel } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

import type { UI_FORM_STRUCT } from '../types';
import {
  applyOptimisticTransactionUpdate,
  buildOptimisticTransaction,
  prepareTxCreationParams,
  prepareTxUpdationParams,
  rollbackOptimisticUpdate,
} from '../utils';

interface SubmitTransactionParams {
  form: UI_FORM_STRUCT;
  isFormCreation: boolean;
  isTransferTx: boolean;
  isCurrenciesDifferent: boolean;
  isOriginalRefundsOverriden: boolean;
  isRecordExternal: boolean;
  transaction?: TransactionModel;
  linkedTransaction?: TransactionModel | null;
  oppositeTransaction?: TransactionModel;
}

interface OptimisticUpdateContext {
  previousQueries: Map<string, unknown>;
}

export function useSubmitTransaction({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { addErrorNotification } = useNotificationCenter();

  return useMutation({
    mutationFn: async (params: SubmitTransactionParams) => {
      const {
        form,
        isFormCreation,
        isTransferTx,
        isCurrenciesDifferent,
        isOriginalRefundsOverriden,
        isRecordExternal,
        transaction,
        linkedTransaction,
      } = params;

      if (isFormCreation) {
        return createTransaction(
          prepareTxCreationParams({
            form,
            isTransferTx,
            isCurrenciesDifferent,
          }),
        );
      } else if (linkedTransaction) {
        return linkTransactions({
          ids: [[transaction!.id, linkedTransaction.id]],
        });
      } else {
        return editTransaction(
          prepareTxUpdationParams({
            form,
            transaction: transaction!,
            linkedTransaction,
            isTransferTx,
            isRecordExternal,
            isCurrenciesDifferent,
            isOriginalRefundsOverriden,
          }),
        );
      }
    },
    onMutate: async (params): Promise<OptimisticUpdateContext | undefined> => {
      const { form, isFormCreation, transaction, isRecordExternal, linkedTransaction } = params;

      // Only apply optimistic updates for edits (not creation or linking)
      if (isFormCreation || linkedTransaction || !transaction) {
        return undefined;
      }

      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });

      // Build the optimistically updated transaction
      const updatedTransaction = buildOptimisticTransaction({
        form,
        transaction,
        isRecordExternal,
      });

      // Apply optimistic update to all relevant caches
      const context = applyOptimisticTransactionUpdate({
        queryClient,
        transactionId: transaction.id,
        updatedTransaction,
      });

      return context;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });

      if (params.transaction?.id) {
        queryClient.invalidateQueries({
          queryKey: getInvalidationQueryKey(params.transaction.id),
        });
      }
      if (params.oppositeTransaction?.id) {
        queryClient.invalidateQueries({
          queryKey: getInvalidationQueryKey(params.oppositeTransaction.id),
        });
      }
      if (params.linkedTransaction?.id) {
        queryClient.invalidateQueries({
          queryKey: getInvalidationQueryKey(params.linkedTransaction.id),
        });
      }

      // Mark onboarding tasks as complete
      const onboardingStore = useOnboardingStore();

      if (params.isFormCreation) {
        const transactionType = params.isTransferTx ? 'transfer' : params.form.amount >= 0 ? 'income' : 'expense';
        trackAnalyticsEvent({
          event: 'transaction_created',
          properties: { transaction_type: transactionType },
        });

        onboardingStore.completeTask('add-transaction');

        // Mark transfer task if this was a transfer
        if (params.isTransferTx) {
          onboardingStore.completeTask('create-transfer');
        }
      }

      // Mark link-transactions task when linking existing transactions
      if (params.linkedTransaction) {
        onboardingStore.completeTask('link-transactions');
      }

      // Mark link-refund task when refund relationships are set
      if (params.form.refundsTx || (params.form.refundedByTxs && params.form.refundedByTxs.length > 0)) {
        onboardingStore.completeTask('link-refund');
      }

      // Mark split-transaction task when transaction has splits
      if (params.form.splits && params.form.splits.length > 0) {
        onboardingStore.completeTask('split-transaction');
      }

      // Mark transfer-out-of-wallet task when source or destination is "out of wallet"
      if (
        params.form.account?.id === OUT_OF_WALLET_ACCOUNT_MOCK.id ||
        params.form.toAccount?.id === OUT_OF_WALLET_ACCOUNT_MOCK.id
      ) {
        onboardingStore.completeTask('mark-transfer-out');
      }

      onSuccess();
    },
    onError: (error, _, context) => {
      // Rollback optimistic update on error
      if (context) {
        rollbackOptimisticUpdate({ queryClient, context });
      }

      if (error instanceof ApiErrorResponseError) {
        addErrorNotification(error.data.message);
      } else {
        // eslint-disable-next-line no-console
        console.error(error);
        addErrorNotification(i18n.global.t('transactions.submit.unexpectedError'));
      }
    },
  });
}
