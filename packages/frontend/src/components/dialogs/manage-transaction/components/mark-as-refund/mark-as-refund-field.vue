<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { useCategoriesStore } from '@/stores';
import { TRANSACTION_TYPES, TransactionSplitModel } from '@bt/shared/types';
import { SplitIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { RefundWithSplit, RefundedByAnotherTxs, RefundsAnoterTx } from '../../types';
import MarkAsRefundDialog from './mark-as-refund-dialog.vue';

const { t } = useI18n();

const props = defineProps<{
  transactionId: number | undefined;
  transactionType: TRANSACTION_TYPES;
  refunds: RefundsAnoterTx;
  refundedBy: RefundedByAnotherTxs;
  disabled?: boolean;
  isThereOriginalRefunds: boolean;
  isRecordCreation: boolean;
  /** Current transaction's splits (for display purposes) */
  currentTransactionSplits?: TransactionSplitModel[];
  /** Current form amount (live value from the form) */
  currentAmount?: number | null;
  /** Current form's currency code */
  currentCurrencyCode?: string;
  /** Current account ID (for recommendations) */
  currentAccountId?: number | null;
}>();

const emit = defineEmits<{
  'update:refunds': [value: RefundsAnoterTx];
  'update:refundedBy': [value: RefundedByAnotherTxs];
}>();

const { categoriesMap } = storeToRefs(useCategoriesStore());

const emptyField = () => {
  emit('update:refunds', props.isThereOriginalRefunds && props.refunds ? null : undefined);
  emit('update:refundedBy', props.isThereOriginalRefunds && props.refundedBy ? null : undefined);
};

const refundTransactions = computed<RefundWithSplit[]>(() => {
  if (props.refunds) return [props.refunds];
  if (props.refundedBy) return props.refundedBy;
  return [];
});

// Get split category info for display
const getSplitInfo = (refund: RefundWithSplit) => {
  if (!refund.splitId) return null;

  // Find the split in the transaction
  const split = refund.transaction.splits?.find((s) => s.id === refund.splitId);
  if (!split) return null;

  const category = categoriesMap.value[split.categoryId];
  return {
    name: category?.name ?? t('common.labels.unknown'),
    color: category?.color ?? '#666',
    amount: split.amount,
  };
};
</script>

<template>
  <template v-if="refunds || refundedBy">
    <p class="text-sm">{{ t('dialogs.manageTransaction.markAsRefund.linkedRefunds') }}</p>
    <div class="flex items-start justify-between gap-2">
      <div class="grid w-full gap-1">
        <template v-for="refund of refundTransactions" :key="refund.transaction.id">
          <div>
            <TransactionRecord :tx="refund.transaction" />
            <!-- Show split info if refund targets a specific split -->
            <template v-if="refund.splitId && getSplitInfo(refund)">
              <div class="border-border/50 bg-muted/20 mt-1 ml-4 flex items-center gap-2 rounded border px-2 py-1">
                <SplitIcon class="text-muted-foreground size-3" />
                <div class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: getSplitInfo(refund)!.color }" />
                <span class="text-muted-foreground text-xs">
                  {{ t('dialogs.manageTransaction.markAsRefund.refundsPortion', { name: getSplitInfo(refund)!.name }) }}
                </span>
              </div>
            </template>
          </div>
        </template>
      </div>

      <Button variant="default" size="icon" :disabled="disabled" class="shrink-0" @click="emptyField">
        <XIcon />
      </Button>
    </div>
  </template>
  <template v-else>
    <MarkAsRefundDialog
      :key="transactionType"
      :refunds="refunds"
      :refunded-by="refundedBy"
      :transaction-type="transactionType"
      :disabled="disabled"
      :is-record-creation="isRecordCreation"
      :current-transaction-splits="currentTransactionSplits"
      :current-amount="currentAmount"
      :current-currency-code="currentCurrencyCode"
      :current-account-id="currentAccountId"
      :current-transaction-id="transactionId"
      @update:refunds="emit('update:refunds', $event)"
      @update:refunded-by="emit('update:refundedBy', $event)"
    />
  </template>
</template>
