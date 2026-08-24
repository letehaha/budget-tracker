import { deleteImportBatch } from '@/api/import-export';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { i18n } from '@/i18n';
import { ApiErrorResponseError } from '@/js/errors';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

export function useDeleteImportBatch({ onSuccess }: { onSuccess?: () => void } = {}) {
  const queryClient = useQueryClient();
  const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

  return useMutation({
    mutationFn: async ({ batchId }: { batchId: string }) => deleteImportBatch({ batchId }),
    onSuccess: (result) => {
      // Deletions move account balances, so refresh everything tx-derived
      // (this also covers the batch-history list itself).
      queryClient.invalidateQueries({
        queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange],
      });

      addSuccessNotification(
        i18n.global.t('pages.importExport.importHistory.deleteSuccessMessage', { count: result.deletedCount }),
      );

      onSuccess?.();
    },
    onError: (error) => {
      if (error instanceof ApiErrorResponseError) {
        addErrorNotification(error.data.message ?? 'Unknown error');
      } else {
        // eslint-disable-next-line no-console
        console.error(error);
        addErrorNotification(i18n.global.t('pages.importExport.importHistory.deleteUnexpectedError'));
      }
    },
  });
}
