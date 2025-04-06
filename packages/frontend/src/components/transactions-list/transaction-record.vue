<template>
  <button
    :class="[
      'py-1 px-2 rounded-md grid grid-cols-[minmax(0,1fr)_max-content] justify-between items-center cursor-pointer w-full gap-2 [content-visibility:auto]',
    ]"
    type="button"
    aria-haspopup="true"
    @click="transactionEmit"
  >
    <div class="flex items-center gap-2 overflow-hidden">
      <template v-if="!isTransferTransaction && category">
        <CategoryCircle :category="category" />
      </template>

      <div class="text-left">
        <template v-if="isTransferTransaction">
          <span class="text-sm tracking-wider whitespace-nowrap">
            {{ accountMovement }}
          </span>
        </template>
        <template v-else>
          <div class="flex gap-2 items-center">
            <span class="text-sm tracking-wider whitespace-nowrap">
              {{ category.name || 'Other' }}
            </span>
            <template v-if="isRefund">
              <div class="border rounded-sm border-primary text-xs text-white/80 px-1 py-0.5">Refund</div>
            </template>
          </div>
        </template>
        <span class="text-sm tracking-wider line-clamp-2 opacity-40 [word-break:break-word]">
          {{ transaction.note }}
        </span>
      </div>
    </div>
    <div>
      <div
        :class="[
          'text-right',
          transaction.transactionType === TRANSACTION_TYPES.income && 'text-app-income-color',
          transaction.transactionType === TRANSACTION_TYPES.expense && 'text-app-expense-color',
        ]"
      >
        {{ formattedAmount }}
      </div>
      <div class="text-sm">
        {{ formateDate(transaction.time) }}
      </div>
    </div>
  </button>
</template>

<script lang="ts" setup>
import CategoryCircle from '@/components/common/category-circle.vue';
import { useOppositeTxRecord } from '@/composable/data-queries/opposite-tx-record';
import { formatUIAmount } from '@/js/helpers';
import { useAccountsStore, useCategoriesStore } from '@/stores';
import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { format } from 'date-fns';
import { storeToRefs } from 'pinia';
import { computed, reactive } from 'vue';

const props = defineProps<{
  tx: TransactionModel;
}>();

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

const { oppositeTransferTransaction } = useOppositeTxRecord(transaction);

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

const formateDate = (date) => format(new Date(date), 'd MMMM y');

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
</script>
