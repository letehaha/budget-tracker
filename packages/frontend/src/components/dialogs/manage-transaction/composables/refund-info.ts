import { getRefundsForTransaction } from '@/api/refunds';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { Ref, computed, onMounted, ref } from 'vue';

import { FORM_TYPES, UI_FORM_STRUCT } from '../types';
import { areSlicesEqual } from './refund-form-comparer';

type RefundStatus = 'refunds' | 'refunded' | null;

export const getRefundInfo = ({
  form,
  initialTransaction,
}: {
  initialTransaction: TransactionModel | undefined;
  form: Ref<UI_FORM_STRUCT>;
}) => {
  const isInitialRefundsDataLoaded = ref(false);
  const initialRefundStatus = ref<RefundStatus>(null);
  const originalRefunds = ref<Awaited<ReturnType<typeof getRefundsForTransaction>>>([]);
  const initialRefundsFormSlice = ref<Pick<UI_FORM_STRUCT, 'refundsTx' | 'refundedByTxs'>>({
    refundsTx: undefined,
    refundedByTxs: undefined,
  });

  const refundTransactionsTypeBasedOnFormType = computed(() =>
    form.value.type === FORM_TYPES.expense ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
  );

  const isOriginalRefundsOverriden = computed(() => {
    const original = {
      refundsTx: initialRefundsFormSlice.value.refundsTx,
      refundedByTxs: initialRefundsFormSlice.value.refundedByTxs,
    };
    const overriden = {
      refundsTx: form.value.refundsTx,
      refundedByTxs: form.value.refundedByTxs,
    };

    return !areSlicesEqual(original, overriden, ['id']);
  });

  onMounted(async () => {
    if (initialTransaction) {
      const refunds = await getRefundsForTransaction({
        transactionId: initialTransaction.id,
      });

      originalRefunds.value = refunds;

      const refundedBy = refunds.filter((r) => r.originalTxId === initialTransaction.id);
      const refundsTx = refunds.find((r) => r.refundTxId === initialTransaction.id);

      if (refundedBy.length) {
        initialRefundStatus.value = 'refunded';
        initialRefundsFormSlice.value.refundedByTxs = refundedBy.map((i) => i.refundTransaction);
      } else if (refundsTx) {
        initialRefundStatus.value = 'refunds';
        initialRefundsFormSlice.value.refundsTx = refundsTx.originalTransaction;
      }
    }
    isInitialRefundsDataLoaded.value = true;
  });

  return {
    initialRefundStatus,
    originalRefunds,
    refundTransactionsTypeBasedOnFormType,
    isOriginalRefundsOverriden,
    isInitialRefundsDataLoaded,
    initialRefundsFormSlice,
  };
};
