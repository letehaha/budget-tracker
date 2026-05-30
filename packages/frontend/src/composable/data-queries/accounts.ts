import { balanceAdjustment as apiBalanceAdjustment } from '@/api/accounts';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

export const useAdjustAccountBalance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      targetBalance,
      note,
      time,
    }: {
      id: string;
      targetBalance: number;
      note?: string;
      time?: Date;
    }) => apiBalanceAdjustment({ id, targetBalance, note, time }),
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
