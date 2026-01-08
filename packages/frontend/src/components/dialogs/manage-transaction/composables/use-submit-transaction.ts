import { createTransaction, editTransaction, linkTransactions } from '@/api';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { getInvalidationQueryKey } from '@/composable/data-queries/opposite-tx-record';
import { i18n } from '@/i18n';
import { ApiErrorResponseError } from '@/js/errors';
import type { TransactionModel } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

import type { UI_FORM_STRUCT } from '../types';
import { prepareTxCreationParams, prepareTxUpdationParams } from '../utils';

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

      onSuccess();
    },
    onError: (error) => {
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
