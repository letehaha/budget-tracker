import { getRefundsForTransaction } from '@/api/refunds';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { Ref, computed, onMounted, ref, watch } from 'vue';

import { FORM_TYPES, UI_FORM_STRUCT } from '../types';
import { areSlicesEqual } from './refund-form-comparer';

type RefundStatus = 'refunds' | 'refunded' | null;

export const getRefundInfo = ({
  form,
  initialTransaction,
  onRefundLinkCleared,
}: {
  initialTransaction: TransactionModel | undefined;
  form: Ref<UI_FORM_STRUCT>;
  /** Fired when a stale refund link is dropped because the form's type flipped. */
  onRefundLinkCleared?: () => void;
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

    // Compare by transaction id and splitId
    return !areSlicesEqual(original, overriden, ['transaction.id', 'splitId']);
  });

  // A refund's counterpart must be the opposite type; the backend rejects a
  // same-type link. Drop a link left stale by a type toggle, using the same
  // empty value as manual unlink: `null` when the row had refunds (edit path
  // clears them server-side), `undefined` otherwise.
  watch(refundTransactionsTypeBasedOnFormType, (expectedType) => {
    const emptyValue = originalRefunds.value.length > 0 ? null : undefined;
    let cleared = false;

    if (form.value.refundsTx && form.value.refundsTx.transaction.transactionType !== expectedType) {
      form.value.refundsTx = emptyValue;
      cleared = true;
    }

    if (
      form.value.refundedByTxs &&
      form.value.refundedByTxs.some((refund) => refund.transaction.transactionType !== expectedType)
    ) {
      form.value.refundedByTxs = emptyValue;
      cleared = true;
    }

    if (cleared) onRefundLinkCleared?.();
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
        // Map to RefundWithSplit format
        initialRefundsFormSlice.value.refundedByTxs = refundedBy.map((i) => ({
          transaction: i.refundTransaction,
          splitId: i.splitId ?? undefined,
        }));
      } else if (refundsTx) {
        initialRefundStatus.value = 'refunds';
        // Map to RefundWithSplit format
        initialRefundsFormSlice.value.refundsTx = {
          transaction: refundsTx.originalTransaction,
          splitId: refundsTx.splitId ?? undefined,
        };
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
