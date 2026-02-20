import { balanceAdjustment as apiBalanceAdjustment } from '@/api/accounts';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

export const useAdjustAccountBalance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, targetBalance, note }: { id: number; targetBalance: number; note?: string }) =>
      apiBalanceAdjustment({ id, targetBalance, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey as string[];
          return queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.transactionChange);
        },
      });
    },
  });
};
