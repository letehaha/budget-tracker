<template>
  <template
    :is="asButton ? 'button' : 'div'"
    :class="[
      'grid w-full cursor-pointer rounded-md px-2 py-1 [content-visibility:auto]',
      shouldShowGroupedTransfer || isLoadingGroupedTransfer
        ? 'grid-cols-[minmax(0,1fr)_max-content] items-end gap-3'
        : 'grid-cols-[minmax(0,1fr)_max-content] items-center gap-2',
    ]"
    :type="asButton ? 'button' : undefined"
    aria-haspopup="true"
    @click="transactionEmit"
  >
    <div class="flex items-center gap-2 overflow-hidden">
      <template v-if="!isTransferTransaction && category">
        <CategoryCircle :category="category" />
      </template>

      <div class="w-full text-left">
        <template v-if="isLoadingGroupedTransfer">
          <!-- Loading skeleton for grouped transfer -->
          <div class="mb-1 flex items-center gap-1.5">
            <span class="text-sm font-medium tracking-wide">
              {{ accountFrom?.name }}
            </span>
            <ArrowRight :size="14" class="opacity-60" />
            <div class="h-4 w-20 animate-pulse rounded bg-white/10"></div>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <span class="text-app-expense-color font-medium tabular-nums">{{ formattedExpenseAmount }}</span>
            <ArrowRight :size="12" class="opacity-40" />
            <div class="h-4 w-16 animate-pulse rounded bg-white/10"></div>
          </div>
        </template>
        <template v-else-if="shouldShowGroupedTransfer">
          <!-- Grouped transfer: show account movement on top with better styling -->
          <div class="mb-1 flex items-center gap-1.5">
            <span class="line-clamp-1 min-w-17 text-sm font-medium tracking-wide">
              {{ accountFrom?.name }}
            </span>
            <ArrowRight :size="14" class="opacity-60" />
            <span class="line-clamp-1 min-w-17 text-sm font-medium tracking-wide">
              {{ accountTo?.name }}
            </span>
          </div>
          <!-- Show both amounts on bottom with better spacing and typography -->
          <div class="flex items-center gap-3 text-sm">
            <span class="text-app-expense-color font-medium whitespace-nowrap tabular-nums">{{
              formattedExpenseAmount
            }}</span>
            <ArrowRight :size="12" class="opacity-40" />
            <span class="text-app-income-color font-medium whitespace-nowrap tabular-nums">{{
              formattedIncomeAmount
            }}</span>
          </div>
        </template>
        <template v-else-if="isTransferTransaction">
          <span class="text-sm tracking-wider whitespace-nowrap">
            {{ accountMovement }}
          </span>
        </template>
        <template v-else>
          <div class="flex items-center gap-2">
            <span class="text-sm tracking-wider whitespace-nowrap">
              {{ category ? category.name : 'Other' }}
            </span>
            <template v-if="hasSplits">
              <div
                class="flex items-center gap-0.5 rounded-sm border border-amber-500/60 px-1 py-0.5 text-xs text-amber-400/90"
              >
                <SplitIcon :size="10" />
                <span>{{ transaction.splits.length + 1 }}</span>
              </div>
            </template>
            <template v-if="isRefund">
              <div class="border-primary rounded-sm border px-1 py-0.5 text-xs text-white/80">Refund</div>
            </template>
          </div>
        </template>
        <span
          v-if="!shouldShowGroupedTransfer"
          class="line-clamp-1 text-sm tracking-wider [word-break:break-word] opacity-40"
        >
          {{ transaction.note }}
        </span>
      </div>
    </div>
    <div v-if="shouldShowGroupedTransfer || isLoadingGroupedTransfer" class="flex items-start pt-0.5">
      <div class="text-right text-sm whitespace-nowrap tabular-nums">
        {{ formateDate(transaction.time) }}
      </div>
    </div>
    <div v-else>
      <div
        :class="[
          'text-right',
          transaction.transactionType === TRANSACTION_TYPES.income && 'text-app-income-color',
          transaction.transactionType === TRANSACTION_TYPES.expense && 'text-app-expense-color',
        ]"
      >
        {{ formattedAmount }}
      </div>
      <div class="text-right text-sm">
        {{ formateDate(transaction.time) }}
      </div>
    </div>
  </template>
</template>

<script lang="ts" setup>
import CategoryCircle from '@/components/common/category-circle.vue';
import { useOppositeTxRecord } from '@/composable/data-queries/opposite-tx-record';
import { formatUIAmount } from '@/js/helpers';
import { useAccountsStore, useCategoriesStore } from '@/stores';
import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { format } from 'date-fns';
import { ArrowRight, SplitIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, reactive } from 'vue';

const props = withDefaults(
  defineProps<{
    tx: TransactionModel;
    asButton?: boolean;
  }>(),
  { asButton: true },
);

const { categoriesMap } = storeToRefs(useCategoriesStore());
const accountsStore = useAccountsStore();
const { accountsRecord } = storeToRefs(accountsStore);

const emit = defineEmits<{
  'record-click': [[value: TransactionModel, oppositeTx: TransactionModel]];
}>();

const transaction = reactive(props.tx);
const isTransferTransaction = computed(() =>
  [TRANSACTION_TRANSFER_NATURE.common_transfer, TRANSACTION_TRANSFER_NATURE.transfer_out_wallet].includes(
    transaction.transferNature,
  ),
);
const isRefund = computed(() => transaction.refundLinked);
const hasSplits = computed(() => transaction.splits && transaction.splits.length > 0);

const { data: oppositeTransferTransaction, isLoading: isLoadingOpposite } = useOppositeTxRecord(transaction);

// Show grouped transfer display when we have both sides
const shouldShowGroupedTransfer = computed(() => {
  return (
    isTransferTransaction.value &&
    transaction.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer &&
    oppositeTransferTransaction.value
  );
});

// Show loading state for common transfers while fetching opposite
const isLoadingGroupedTransfer = computed(() => {
  return (
    isTransferTransaction.value &&
    transaction.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer &&
    isLoadingOpposite.value
  );
});

const category = computed(() => categoriesMap.value[transaction.categoryId]);
const accountFrom = computed(() => accountsRecord.value[transaction.accountId]);
const accountTo = computed(() => accountsRecord.value[oppositeTransferTransaction.value?.accountId]);

const accountMovement = computed(() => {
  const separator = transaction.transactionType === TRANSACTION_TYPES.expense ? '=>' : '<=';

  if (transaction.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) {
    return `${accountFrom.value?.name} ${separator} Out of wallet`;
  }
  return `${accountFrom.value?.name} ${separator} ${accountTo.value?.name}`;
});

const formateDate = (date: string | number | Date) => format(new Date(date), 'd MMM y');

const transactionEmit = () => {
  emit('record-click', [transaction, oppositeTransferTransaction.value]);
};

const formattedAmount = computed(() => {
  let amount = transaction.amount;

  if (transaction.transactionType === TRANSACTION_TYPES.expense) {
    amount *= -1;
  }

  return formatUIAmount(amount, {
    currency: props.tx.currencyCode,
  });
});

const formattedExpenseAmount = computed(() => {
  return formatUIAmount(-transaction.amount, {
    currency: props.tx.currencyCode,
  });
});

const formattedIncomeAmount = computed(() => {
  if (!oppositeTransferTransaction.value) return '';
  return formatUIAmount(oppositeTransferTransaction.value.amount, {
    currency: oppositeTransferTransaction.value.currencyCode,
  });
});
</script>
