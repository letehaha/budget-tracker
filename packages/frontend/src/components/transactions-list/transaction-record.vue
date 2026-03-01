<template>
  <div
    :class="[
      'hover:bg-muted/50 grid w-full cursor-pointer rounded-md px-2 py-1 transition-colors [content-visibility:auto]',
      showCheckbox
        ? 'grid-cols-[auto_minmax(0,1fr)_max-content] items-center gap-2'
        : shouldShowGroupedTransfer || isLoadingGroupedTransfer
          ? 'grid-cols-[minmax(0,1fr)_max-content] items-end gap-3'
          : 'grid-cols-[minmax(0,1fr)_max-content] items-center gap-2',
    ]"
    aria-haspopup="true"
    @click="transactionEmit"
  >
    <!-- Selection checkbox -->
    <label v-if="showCheckbox" class="-my-1 -ml-2 flex items-center justify-center self-stretch px-3" @click.stop>
      <Checkbox v-if="isSelectable" v-model="checkedModel" />
      <div v-else class="size-4" />
    </label>

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
            <span class="text-amount text-app-expense-color">{{ formattedExpenseAmount }}</span>
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
            <span class="text-amount text-app-expense-color whitespace-nowrap">{{ formattedExpenseAmount }}</span>
            <ArrowRight :size="12" class="opacity-40" />
            <span class="text-amount text-app-income-color whitespace-nowrap">{{ formattedIncomeAmount }}</span>
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
              {{ category ? category.name : t('common.ui.other') }}
            </span>
            <SplitIndicator :transaction="transaction" />
            <RefundIndicator :transaction="transaction" />
            <TagsIndicator :transaction="transaction" />
          </div>
        </template>
        <span
          v-if="!shouldShowGroupedTransfer && !isLoadingGroupedTransfer"
          class="text-muted-foreground line-clamp-1 text-sm tracking-wider [word-break:break-word]"
        >
          {{ transaction.note }}
        </span>
      </div>
    </div>
    <div v-if="shouldShowGroupedTransfer || isLoadingGroupedTransfer" class="flex items-start pt-0.5">
      <div class="text-muted-foreground text-right text-xs whitespace-nowrap tabular-nums">
        {{ formateDate(transaction.time) }}
      </div>
    </div>
    <div v-else>
      <div
        :class="[
          'text-amount text-right',
          transaction.transactionType === TRANSACTION_TYPES.income && 'text-app-income-color',
          transaction.transactionType === TRANSACTION_TYPES.expense && 'text-app-expense-color',
        ]"
      >
        {{ formattedAmount }}
      </div>
      <div class="text-muted-foreground text-right text-xs">
        {{ formateDate(transaction.time) }}
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import CategoryCircle from '@/components/common/category-circle.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { useOppositeTxRecord } from '@/composable/data-queries/opposite-tx-record';
import { formatUIAmount } from '@/js/helpers';
import { useAccountsStore, useCategoriesStore } from '@/stores';
import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { format } from 'date-fns';
import { ArrowRight } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';

import RefundIndicator from './indicators/refund-indicator.vue';
import SplitIndicator from './indicators/split-indicator.vue';
import TagsIndicator from './indicators/tags-indicator.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    tx: TransactionModel;
    asButton?: boolean;
    showCheckbox?: boolean;
    isSelected?: boolean;
    isSelectable?: boolean;
    index?: number;
  }>(),
  {
    asButton: true,
    showCheckbox: false,
    isSelected: false,
    isSelectable: true,
    index: 0,
  },
);

const { categoriesMap } = storeToRefs(useCategoriesStore());
const accountsStore = useAccountsStore();
const { accountsRecord } = storeToRefs(accountsStore);

const emit = defineEmits<{
  'record-click': [[value: TransactionModel, oppositeTx: TransactionModel | undefined]];
  'selection-change': [{ value: boolean; id: number; index: number }];
}>();

const transaction = reactive(props.tx);
const isTransferTransaction = computed(() =>
  [
    TRANSACTION_TRANSFER_NATURE.common_transfer,
    TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
    TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
  ].includes(transaction.transferNature),
);

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
const accountTo = computed(() =>
  oppositeTransferTransaction.value ? accountsRecord.value[oppositeTransferTransaction.value.accountId] : undefined,
);

const accountMovement = computed(() => {
  const separator = transaction.transactionType === TRANSACTION_TYPES.expense ? '=>' : '<=';

  if (transaction.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) {
    return `${accountFrom.value?.name} ${separator} Out of wallet`;
  }
  if (transaction.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio) {
    return `${accountFrom.value?.name} ${separator} Portfolio`;
  }
  return `${accountFrom.value?.name} ${separator} ${accountTo.value?.name}`;
});

const formateDate = (date: string | number | Date) => format(new Date(date), 'd MMM y');

const transactionEmit = () => {
  emit('record-click', [transaction, oppositeTransferTransaction.value ?? undefined]);
};

// Computed with get/set for v-model binding
const checkedModel = computed({
  get: () => props.isSelected,
  set: (value: boolean | 'indeterminate') => {
    if (!props.isSelectable) return;
    emit('selection-change', {
      value: value === true,
      id: transaction.id,
      index: props.index,
    });
  },
});

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
