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
      <ResponsiveTooltip
        v-else-if="unselectableReason"
        :delay-duration="100"
        :content="$t(`transactions.bulkEdit.unselectableReasons.${unselectableReason}`)"
        content-class-name="max-w-56"
      >
        <InfoIcon class="text-muted-foreground size-3.5 cursor-help" />
      </ResponsiveTooltip>
      <div v-else class="size-4" />
    </label>

    <div class="flex items-center gap-2 overflow-hidden">
      <template v-if="!isTransferTransaction && !isPortfolioLinked && category">
        <CategoryCircle :category="category" />
      </template>

      <div class="w-full text-left">
        <template v-if="isLoadingGroupedTransfer">
          <!-- Loading skeleton for grouped transfer: the known leg stays on its
               own side (source on the left, destination on the right), the
               still-loading opposite leg renders as a placeholder. -->
          <div class="mb-1 flex items-center gap-1.5">
            <div v-if="ownLegIsIncome" class="h-4 w-20 animate-pulse rounded bg-white/10"></div>
            <span v-else class="text-sm font-medium tracking-wide">
              {{ accountFrom?.name }}
            </span>
            <ArrowRight :size="14" class="opacity-60" />
            <span v-if="ownLegIsIncome" class="text-sm font-medium tracking-wide">
              {{ accountFrom?.name }}
            </span>
            <div v-else class="h-4 w-20 animate-pulse rounded bg-white/10"></div>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <div v-if="ownLegIsIncome" class="h-4 w-16 animate-pulse rounded bg-white/10"></div>
            <span v-else class="text-amount text-app-expense-color">{{ formattedExpenseAmount }}</span>
            <ArrowRight :size="12" class="opacity-40" />
            <span v-if="ownLegIsIncome" class="text-amount text-app-income-color">{{ formattedIncomeAmount }}</span>
            <div v-else class="h-4 w-16 animate-pulse rounded bg-white/10"></div>
          </div>
        </template>
        <template v-else-if="shouldShowGroupedTransfer">
          <!-- Grouped transfer: show account movement on top with better styling -->
          <div class="mb-1 flex items-center gap-1.5">
            <span class="line-clamp-1 min-w-17 text-sm font-medium tracking-wide">
              {{ transferFromAccount?.name }}
            </span>
            <ArrowRight :size="14" class="opacity-60" />
            <HandCoinsIcon v-if="isLoanDestination" :size="14" class="text-app-transfer-color shrink-0" />
            <span class="line-clamp-1 min-w-17 text-sm font-medium tracking-wide">
              {{ transferToAccount?.name }}
            </span>
          </div>
          <!-- Show both amounts on bottom with better spacing and typography -->
          <div class="flex items-center gap-3 text-sm">
            <span class="text-amount text-app-expense-color whitespace-nowrap">{{ formattedExpenseAmount }}</span>
            <ArrowRight :size="12" class="opacity-40" />
            <span class="text-amount text-app-income-color whitespace-nowrap">{{ formattedIncomeAmount }}</span>
          </div>
        </template>
        <template v-else-if="isPortfolioLinked">
          <div class="flex items-center gap-1.5">
            <span class="line-clamp-1 text-sm tracking-wider">
              {{ accountFrom?.name }}
            </span>
            <ArrowRight :size="14" class="shrink-0 opacity-60" />
            <BriefcaseIcon :size="14" class="text-app-transfer-color shrink-0" />
            <template v-if="isLoadingPortfolioLink">
              <div class="h-4 w-16 animate-pulse rounded bg-white/10" />
            </template>
            <template v-else>
              <span
                class="line-clamp-1 text-sm tracking-wider"
                :class="{ 'text-muted-foreground line-through': isPortfolioDeleted }"
              >
                {{ portfolioName }}
              </span>
              <DeletedBadge v-if="isPortfolioDeleted" />
            </template>
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
            <ResponsiveTooltip
              v-if="addedByTooltip"
              :content="addedByTooltip"
              content-class-name="max-w-56"
              :delay-duration="100"
            >
              <UsersIcon class="text-muted-foreground size-3.5 shrink-0 cursor-help" :aria-label="addedByTooltip" />
            </ResponsiveTooltip>
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
import DeletedBadge from '@/components/common/deleted-badge.vue';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { useOppositeTxRecord } from '@/composable/data-queries/opposite-tx-record';
import type { BulkUnselectableReason } from '@/composable/transaction-selection';
import { useTransactionPortfolioLink } from '@/composable/data-queries/portfolio-transfers';
import { formatUIAmount } from '@/js/helpers';
import { useAccountsStore, useCategoriesStore, useUserStore } from '@/stores';
import {
  isTwoLegTransfer,
  ACCOUNT_CATEGORIES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TransactionModel,
} from '@bt/shared/types';
import { format } from 'date-fns';
import { ArrowRight, BriefcaseIcon, InfoIcon, HandCoinsIcon, UsersIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
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
    /** Shown as an explainer tooltip in place of the checkbox when not selectable. */
    unselectableReason?: BulkUnselectableReason | null;
    index?: number;
  }>(),
  {
    asButton: true,
    showCheckbox: false,
    isSelected: false,
    isSelectable: true,
    unselectableReason: null,
    index: 0,
  },
);

const { categoriesMap } = storeToRefs(useCategoriesStore());
const accountsStore = useAccountsStore();
const { accountsRecord } = storeToRefs(accountsStore);
const { user: currentUser } = storeToRefs(useUserStore());

const emit = defineEmits<{
  'record-click': [[value: TransactionModel, oppositeTx: TransactionModel | undefined]];
  'selection-change': [{ value: boolean; id: string; index: number }];
}>();

// Track props.tx reactively rather than snapshotting it: a list row can be reused
// (kept by :key) while its tx is swapped — e.g. transfer_out_wallet → common_transfer
// after linking. A reactive(props.tx) snapshot would freeze the original object and
// never pick up the new transferId, leaving the opposite leg unresolved.
const transaction = computed(() => props.tx);
const isTransferTransaction = computed(
  () =>
    isTwoLegTransfer(transaction.value.transferNature) ||
    transaction.value.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
);

const { data: oppositeTransferTransaction, isLoading: isLoadingOpposite } = useOppositeTxRecord(() => props.tx);

const isPortfolioLinked = computed(
  () => transaction.value.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
);
const portfolioLinkId = computed(() => (isPortfolioLinked.value ? transaction.value.id : undefined));
const { data: portfolioLinkData, isLoading: isLoadingPortfolioLink } = useTransactionPortfolioLink(portfolioLinkId);
const portfolioName = computed(() => portfolioLinkData.value?.portfolioName ?? '');
const isPortfolioDeleted = computed(() => portfolioLinkData.value?.isPortfolioDeleted ?? false);

// Show grouped transfer display when we have both sides
const shouldShowGroupedTransfer = computed(() => {
  return (
    isTransferTransaction.value &&
    isTwoLegTransfer(transaction.value.transferNature) &&
    oppositeTransferTransaction.value
  );
});

const isLoadingGroupedTransfer = computed(() => {
  return isTransferTransaction.value && isTwoLegTransfer(transaction.value.transferNature) && isLoadingOpposite.value;
});

const category = computed(() => categoriesMap.value[transaction.value.categoryId]);
const accountFrom = computed(() => accountsRecord.value[transaction.value.accountId]);

// Budget-scoped fetches enrich each tx with `addedBy = { id, username }` describing who
// attached the row to the budget (recipient via metadata.addedByUserId, else the budget
// owner). The icon is only meaningful when the attacher is someone other than the
// viewer — otherwise it reads "Added by yourself", which is noise.
const addedByTooltip = computed(() => {
  const addedBy = transaction.value.addedBy;
  if (!addedBy || addedBy.id === currentUser.value?.id) return undefined;
  return t('transactions.addedByTooltip', { handle: `@${addedBy.username}` });
});
const accountTo = computed(() =>
  oppositeTransferTransaction.value ? accountsRecord.value[oppositeTransferTransaction.value.accountId] : undefined,
);

// A two-leg transfer row can hold either leg: lists scoped to the destination
// account (e.g. loan recent payments) hand us the income leg. Grouped display
// always renders source → destination, so resolve the legs by transaction type
// instead of assuming the row is the expense side.
const ownLegIsIncome = computed(() => transaction.value.transactionType === TRANSACTION_TYPES.income);
const transferSourceLeg = computed(() =>
  ownLegIsIncome.value ? oppositeTransferTransaction.value : transaction.value,
);
const transferDestinationLeg = computed(() =>
  ownLegIsIncome.value ? transaction.value : oppositeTransferTransaction.value,
);
const transferFromAccount = computed(() =>
  transferSourceLeg.value ? accountsRecord.value[transferSourceLeg.value.accountId] : undefined,
);
const transferToAccount = computed(() =>
  transferDestinationLeg.value ? accountsRecord.value[transferDestinationLeg.value.accountId] : undefined,
);

const isLoanDestination = computed(() => transferToAccount.value?.accountCategory === ACCOUNT_CATEGORIES.loan);

const accountMovement = computed(() => {
  const separator = transaction.value.transactionType === TRANSACTION_TYPES.expense ? '=>' : '<=';

  if (transaction.value.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) {
    return `${accountFrom.value?.name} ${separator} Out of wallet`;
  }
  // accountTo can be undefined when the counterpart account is hidden from the caller —
  // e.g. a recipient viewing a transfer on a shared account whose other side lives in an
  // unshared private account of the owner. Fall back to a labeled placeholder rather than
  // rendering the literal string "undefined".
  const fromName = accountFrom.value?.name ?? t('transactions.transfer.hiddenAccount');
  const toName = accountTo.value?.name ?? t('transactions.transfer.hiddenAccount');
  return `${fromName} ${separator} ${toName}`;
});

const formateDate = (date: string | number | Date) => format(new Date(date), 'd MMM y');

const transactionEmit = () => {
  emit('record-click', [transaction.value, oppositeTransferTransaction.value ?? undefined]);
};

// Computed with get/set for v-model binding
const checkedModel = computed({
  get: () => props.isSelected,
  set: (value: boolean | 'indeterminate') => {
    if (!props.isSelectable) return;
    emit('selection-change', {
      value: value === true,
      id: transaction.value.id,
      index: props.index,
    });
  },
});

const formattedAmount = computed(() => {
  let amount = transaction.value.amount;

  if (transaction.value.transactionType === TRANSACTION_TYPES.expense) {
    amount *= -1;
  }

  return formatUIAmount(amount, {
    currency: props.tx.currencyCode,
  });
});

const formattedExpenseAmount = computed(() => {
  const leg = transferSourceLeg.value;
  if (!leg) return '';
  return formatUIAmount(-leg.amount, {
    currency: leg.currencyCode,
  });
});

const formattedIncomeAmount = computed(() => {
  const leg = transferDestinationLeg.value;
  if (!leg) return '';
  return formatUIAmount(leg.amount, {
    currency: leg.currencyCode,
  });
});
</script>
