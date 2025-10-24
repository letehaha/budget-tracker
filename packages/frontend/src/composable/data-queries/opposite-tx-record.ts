import { loadTransactionsByTransferId } from '@/api/transactions';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

const BASE_QUERY_KEY = 'transactions-by-transfer-id';

export function useOppositeTxRecord(transaction) {
  const isTransferTransaction = computed(() =>
    [TRANSACTION_TRANSFER_NATURE.common_transfer, TRANSACTION_TRANSFER_NATURE.transfer_out_wallet].includes(
      transaction.transferNature,
    ),
  );

  return useQuery({
    queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange, BASE_QUERY_KEY, transaction.id, transaction.transferId],
    queryFn: async () => {
      if (!transaction.transferId) return null;
      const transactions = await loadTransactionsByTransferId(transaction.transferId);
      if (!transactions) return null;
      return transactions.find((item) => item.id !== transaction.id) || null;
    },
    enabled: isTransferTransaction.value,
    staleTime: Infinity,
  });
}

export const getInvalidationQueryKey = (transactionId) => [BASE_QUERY_KEY, transactionId];
