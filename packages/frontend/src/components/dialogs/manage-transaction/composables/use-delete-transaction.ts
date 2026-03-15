import { deleteTransaction } from '@/api';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { i18n } from '@/i18n';
import { ApiErrorResponseError } from '@/js/errors';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

interface DeleteTransactionParams {
  transactionId: number;
}

export function useDeleteTransaction({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

  return useMutation({
    mutationFn: async (params: DeleteTransactionParams) => {
      return deleteTransaction(params.transactionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
      addSuccessNotification(i18n.global.t('common.transactions.delete.success'));
      onSuccess();
    },
    onError: (error) => {
      if (error instanceof ApiErrorResponseError) {
        addErrorNotification(error.data.message ?? error.message);
      } else {
        // eslint-disable-next-line no-console
        console.error(error);
        addErrorNotification(i18n.global.t('common.transactions.delete.error'));
      }
    },
  });
}
