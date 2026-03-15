import { unlinkTransactions as apiUnlinkTransactions } from '@/api';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { getInvalidationQueryKey } from '@/composable/data-queries/opposite-tx-record';
import { i18n } from '@/i18n';
import { ApiErrorResponseError } from '@/js/errors';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

interface UnlinkTransactionsParams {
  transferIds: string[];
  transactionId?: number;
  oppositeTransactionId?: number;
}

export function useUnlinkTransactions({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { addErrorNotification } = useNotificationCenter();

  return useMutation({
    mutationFn: async (params: UnlinkTransactionsParams) => {
      return apiUnlinkTransactions({
        transferIds: params.transferIds,
      });
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });

      if (params.transactionId) {
        queryClient.invalidateQueries({
          queryKey: getInvalidationQueryKey(params.transactionId),
        });
      }
      if (params.oppositeTransactionId) {
        queryClient.invalidateQueries({
          queryKey: getInvalidationQueryKey(params.oppositeTransactionId),
        });
      }

      onSuccess();
    },
    onError: (error) => {
      if (error instanceof ApiErrorResponseError) {
        addErrorNotification(error.data.message ?? error.message);
      } else {
        // eslint-disable-next-line no-console
        console.error(error);
        addErrorNotification(i18n.global.t('common.transactions.unlink.error'));
      }
    },
  });
}
