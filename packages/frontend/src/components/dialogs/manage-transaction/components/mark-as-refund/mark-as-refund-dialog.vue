<script lang="ts" setup>
import type { FormattedCategory } from '@/common/types';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { PillTabs, type PillTabItem } from '@/components/lib/ui/pill-tabs';
import { useExchangeRates } from '@/composable/data-queries/currencies';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { formatUIAmount } from '@/js/helpers';
import { useCategoriesStore, useCurrenciesStore } from '@/stores';
import { TRANSACTION_TYPES, TransactionModel, TransactionSplitModel } from '@bt/shared/types';
import { CheckIcon, SplitIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { RefundedByAnotherTxs, RefundsAnoterTx } from '../../types';
import { computeRefundLinkTotals } from '../../utils/refund-link-totals';
import MarkAsRefundInfo from './mark-as-refund-info.vue';
import RefundLinkCard from './refund-link-card.vue';
import RecordsList from './refund-records-list.vue';

const props = defineProps<{
  transactionType: TRANSACTION_TYPES;
  disabled?: boolean;
  isRecordCreation: boolean;
  refunds: RefundsAnoterTx;
  refundedBy: RefundedByAnotherTxs;
  /** Current transaction's splits (for "refunded by" mode - to know which split is being refunded) */
  currentTransactionSplits?: TransactionSplitModel[];
  /** Current form amount (live value) */
  currentAmount?: number | null;
  /** Current form's currency code */
  currentCurrencyCode?: string;
  /** Current form's category (shown in the link card) */
  currentCategory?: FormattedCategory | null;
  /** Current account ID (for recommendations) */
  currentAccountId?: string | null;
  /** Current transaction ID (for recommendations when editing) */
  currentTransactionId?: string;
}>();

const emit = defineEmits<{
  'update:refunds': [value: RefundsAnoterTx];
  'update:refundedBy': [value: RefundedByAnotherTxs];
}>();

const { t } = useI18n();
const { categoriesMap } = storeToRefs(useCategoriesStore());
const { baseCurrency } = storeToRefs(useCurrenciesStore());
const { ratesMap } = useExchangeRates();
const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const selectionState = reactive<{
  refunds: RefundsAnoterTx;
  refundedBy: RefundedByAnotherTxs;
}>({
  refunds: undefined,
  refundedBy: undefined,
});

// Track which split is selected for the "refunds" mode (when target tx has splits)
const selectedSplitId = ref<string | null>(null);
// Track selected transaction for split selection dialog
const pendingTransaction = ref<TransactionModel | null>(null);
// Temporary split selection state (before confirming in split dialog)
const tempSplitSelection = ref<{ splitId: string | null } | null>(null);

const isDialogOpen = ref(false);
const isSplitDialogOpen = ref(false);

const openDialog = () => {
  isDialogOpen.value = true;
};

const selectedOption = ref<'refunds' | 'refunded'>('refunds');

const onModeChange = (value: string) => {
  selectedOption.value = value as 'refunds' | 'refunded';
};

const modeItems = computed<PillTabItem[]>(() => [
  { value: 'refunds', label: t('dialogs.manageTransaction.markAsRefund.modeRefunds') },
  {
    value: 'refunded',
    label: t('dialogs.manageTransaction.markAsRefund.refundedByLabel'),
    disabled: props.isRecordCreation,
  },
]);

// The picker lists candidates of the opposite type, so the current entry's own type is the inverse.
const currentEntryType = computed(() =>
  props.transactionType === TRANSACTION_TYPES.income ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
);

// Keep flush 'sync': with the default flush this wipe runs after the open handler
// and clobbers the selection it just seeded from props.
watch(
  selectedOption,
  () => {
    selectionState.refunds = undefined;
    selectionState.refundedBy = undefined;
    selectedSplitId.value = null;
    pendingTransaction.value = null;
  },
  { flush: 'sync' },
);

watch(isDialogOpen, (open) => {
  if (open) {
    selectedOption.value = props.refundedBy?.length ? 'refunded' : 'refunds';
    selectionState.refunds = props.refunds ?? undefined;
    selectionState.refundedBy = props.refundedBy?.length ? [...props.refundedBy] : undefined;
    selectedSplitId.value = props.refunds?.splitId ?? null;
  } else {
    selectionState.refunds = undefined;
    selectionState.refundedBy = undefined;
    selectedSplitId.value = null;
    pendingTransaction.value = null;
  }
});

// Reset temp selection when split dialog closes without confirming
watch(isSplitDialogOpen, (open) => {
  if (!open) {
    tempSplitSelection.value = null;
  }
});

const onSelectValue = (v: TransactionModel) => {
  if (selectedOption.value === 'refunds') {
    // Check if this transaction has splits
    if (v.splits && v.splits.length > 0) {
      // If clicking on already selected transaction, deselect it
      if (selectionState.refunds?.transaction.id === v.id) {
        selectionState.refunds = undefined;
        pendingTransaction.value = null;
        selectedSplitId.value = null;
        return;
      }
      // Open split selection dialog
      pendingTransaction.value = v;
      tempSplitSelection.value = null;
      isSplitDialogOpen.value = true;
    } else {
      // No splits - traditional behavior
      if (selectionState.refunds?.transaction.id === v.id) {
        selectionState.refunds = undefined;
      } else {
        selectionState.refunds = { transaction: v };
      }
      pendingTransaction.value = null;
      selectedSplitId.value = null;
    }
    selectionState.refundedBy = undefined;
  } else if (selectedOption.value === 'refunded') {
    const existingValues = Array.isArray(selectionState.refundedBy) ? selectionState.refundedBy : [];

    if (existingValues.some((i) => i.transaction.id === v.id)) {
      selectionState.refundedBy = existingValues.filter((i) => i.transaction.id !== v.id);
    } else {
      // For "refunded by" mode, we need to select which split of CURRENT transaction is being refunded
      // For now, add without splitId - the split selection will be shown separately
      selectionState.refundedBy = [...existingValues, { transaction: v }];
    }
    selectionState.refunds = undefined;
  }
};

const clearSelection = () => {
  selectionState.refunds = undefined;
  selectionState.refundedBy = undefined;
  selectedSplitId.value = null;
  pendingTransaction.value = null;
};

// Handle temporary split selection in the dialog
const selectTempSplit = (splitId: string | null) => {
  tempSplitSelection.value = { splitId };
};

// Confirm split selection and close split dialog
const confirmSplitSelection = () => {
  if (!pendingTransaction.value) return;

  if (tempSplitSelection.value) {
    selectedSplitId.value = tempSplitSelection.value.splitId;
    selectionState.refunds = {
      transaction: pendingTransaction.value,
      splitId: tempSplitSelection.value.splitId ?? undefined,
    };
  }

  isSplitDialogOpen.value = false;
  tempSplitSelection.value = null;
};

const selectedTransactions = computed(() => {
  if (selectionState.refunds) return [selectionState.refunds.transaction];
  if (selectionState.refundedBy) return selectionState.refundedBy.map((r) => r.transaction);
  return [];
});

const totals = computed(() =>
  computeRefundLinkTotals({
    transactions: selectedTransactions.value,
    currentAmount: props.currentAmount,
    currentCurrencyCode: props.currentCurrencyCode,
    ratesMap: ratesMap.value,
    baseCurrencyCode: baseCurrency.value?.currencyCode,
  }),
);

const totalLabel = computed(() => {
  if (totals.value.total === null || !totals.value.currencyCode) return null;
  const formatted = formatUIAmount(totals.value.total, { currency: totals.value.currencyCode });
  return totals.value.isTotalConverted ? `≈ ${formatted}` : formatted;
});

const limitLabel = computed(() => {
  if (!props.currentAmount || props.currentAmount <= 0) return null;
  return formatUIAmount(props.currentAmount, { currency: props.currentCurrencyCode });
});

const helperText = computed(() => {
  if (selectedOption.value === 'refunds') return t('dialogs.manageTransaction.markAsRefund.helperRefunds');
  if (limitLabel.value) {
    return t('dialogs.manageTransaction.markAsRefund.helperRefundedBy', { amount: limitLabel.value });
  }
  return t('dialogs.manageTransaction.markAsRefund.helperRefundedByNoLimit');
});

const summaryText = computed(() => {
  const count = selectedTransactions.value.length;
  const keyBase = 'dialogs.manageTransaction.markAsRefund';
  if (!count) return t(`${keyBase}.summaryEmpty`);
  if (!totalLabel.value) return t(`${keyBase}.summaryCountOnly`, { count });

  const amount = totalLabel.value;
  if (selectedOption.value === 'refunds') return t(`${keyBase}.summarySelected`, { count, amount });

  if (totals.value.isOverLimit) {
    if (totals.value.isExactComparison && totals.value.total !== null && props.currentAmount) {
      const excess = formatUIAmount(totals.value.total - props.currentAmount, {
        currency: props.currentCurrencyCode,
      });
      return t(`${keyBase}.summaryExceedsBy`, { count, amount, excess });
    }
    return t(`${keyBase}.summaryExceeds`, { count, amount });
  }
  if (limitLabel.value) return t(`${keyBase}.summaryOfLimit`, { count, amount, limit: limitLabel.value });
  return t(`${keyBase}.summarySelected`, { count, amount });
});

const isSaveDisabled = computed(() => {
  if (selectionState.refunds === undefined && selectionState.refundedBy === undefined) return true;
  // Cross-currency totals only warn — the backend re-validates with converted amounts on save.
  return totals.value.isOverLimit && totals.value.isExactComparison;
});

// Get main category info for transaction
const getMainCategoryInfo = (tx: TransactionModel) => {
  const category = categoriesMap.value[tx.categoryId];
  const splitsTotal = tx.splits?.reduce((sum, s) => sum + s.amount, 0) ?? 0;
  const mainAmount = tx.amount - splitsTotal;

  return {
    category,
    amount: mainAmount,
    name: category?.name ?? 'Unknown',
    color: category?.color ?? '#666',
  };
};

// Get split category info
const getSplitCategoryInfo = (split: TransactionSplitModel) => {
  const category = categoriesMap.value[split.categoryId];
  return {
    category,
    name: category?.name ?? 'Unknown',
    color: category?.color ?? '#666',
  };
};

const saveState = () => {
  if (selectionState.refunds !== undefined) {
    emit('update:refunds', selectionState.refunds);
  } else if (selectionState.refundedBy !== undefined) {
    emit('update:refundedBy', selectionState.refundedBy);
  }
  isDialogOpen.value = false;
};

// Check if confirm button should be disabled (no selection made)
const isSplitConfirmDisabled = computed(() => {
  return tempSplitSelection.value === null;
});

// Check if currencies match
const isSameCurrency = computed(() => {
  if (!pendingTransaction.value || !props.currentCurrencyCode) return false;
  return pendingTransaction.value.currencyCode === props.currentCurrencyCode;
});

// Convert amount to base currency using exchange rate
const convertToBase = (amount: number, currencyCode: string): number | null => {
  const rate = ratesMap.value[currencyCode];
  if (!rate) return null;
  return amount * rate.rate;
};

// Get refund amount in base currency (for cross-currency comparison)
const currentRefundInBase = computed(() => {
  if (!props.currentAmount || props.currentAmount <= 0 || !props.currentCurrencyCode) return null;
  return convertToBase(props.currentAmount, props.currentCurrencyCode);
});

// Check if an amount is too small for the current refund
// For same currency: direct comparison. For different currencies: convert to base and compare.
const isAmountTooSmall = (targetAmount: number, targetCurrencyCode?: string) => {
  if (!props.currentAmount || props.currentAmount <= 0) return false;

  // Same currency - direct comparison
  if (!targetCurrencyCode || targetCurrencyCode === props.currentCurrencyCode) {
    return targetAmount < props.currentAmount;
  }

  // Different currency - convert both to base currency
  const targetInBase = convertToBase(targetAmount, targetCurrencyCode);
  if (targetInBase === null || currentRefundInBase.value === null) return false;

  return targetInBase < currentRefundInBase.value;
};

// Check if main category amount is too small
const isMainCategoryTooSmall = computed(() => {
  if (!pendingTransaction.value) return false;
  const mainAmount = getMainCategoryInfo(pendingTransaction.value).amount;
  return isAmountTooSmall(mainAmount, pendingTransaction.value.currencyCode);
});

// Check if a split amount is too small
const isSplitTooSmall = (split: TransactionSplitModel) => {
  return isAmountTooSmall(split.amount, pendingTransaction.value?.currencyCode);
};

// For same currency: disable options. For different currency: just warn (backend validates)
const shouldDisableOption = (tooSmall: boolean) => {
  return isSameCurrency.value && tooSmall;
};

// Check if any option would trigger a warning (used for showing warning message)
const hasSmallOptions = computed(() => {
  if (!pendingTransaction.value) return false;
  if (isMainCategoryTooSmall.value) return true;
  return pendingTransaction.value.splits?.some((s) => isSplitTooSmall(s)) ?? false;
});
</script>

<template>
  <div>
    <slot name="trigger" :open="openDialog">
      <Button class="w-full" :disabled="disabled" variant="secondary" @click="openDialog">
        {{ $t('dialogs.manageTransaction.markAsRefund.linkRefund') }}
      </Button>
    </slot>

    <!-- Main Dialog -->
    <ResponsiveDialog
      v-model:open="isDialogOpen"
      custom-close
      sr-only-header
      no-internal-scroll
      dialog-content-class="h-[min(85dvh,46rem)] max-h-[90dvh] gap-0 overflow-hidden p-0"
      drawer-content-class="h-[calc(100dvh-1.25rem)] max-h-[calc(100dvh-1.25rem)] px-0"
    >
      <template #title>{{ $t('dialogs.manageTransaction.markAsRefund.linkRefund') }}</template>
      <template #description>{{ helperText }}</template>

      <div class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <!-- Chrome: strip, header, mode switch, link card -->
        <div class="px-4 pt-3 pb-3 md:px-6 md:pt-0">
          <div
            v-if="!isMobileView"
            :class="[
              '-mx-6 mb-4 h-3 rounded-t-lg',
              currentEntryType === TRANSACTION_TYPES.income ? 'bg-app-income-color' : 'bg-app-expense-color',
            ]"
          />
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-lg leading-none font-semibold tracking-tight">
                {{ $t('dialogs.manageTransaction.markAsRefund.linkRefund') }}
              </p>
              <p class="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                {{ helperText }}
                <MarkAsRefundInfo />
              </p>
            </div>
            <Button variant="ghost" class="-mt-1.5 -mr-2 shrink-0" @click="isDialogOpen = false">
              {{ $t('common.ui.close') }}
            </Button>
          </div>

          <PillTabs
            :model-value="selectedOption"
            :items="modeItems"
            size="lg"
            full-width
            class="mt-4"
            @update:model-value="onModeChange"
          />
          <p v-if="isRecordCreation" class="text-muted-foreground mt-1.5 text-xs">
            {{ $t('dialogs.manageTransaction.markAsRefund.refundedByCreationHint') }}
          </p>

          <RefundLinkCard
            class="mt-3"
            :mode="selectedOption"
            :current-entry-type="currentEntryType"
            :current-amount="currentAmount"
            :current-currency-code="currentCurrencyCode"
            :current-category="currentCategory"
            :selected="selectedTransactions"
            :totals="totals"
            @clear="clearSelection"
          />
        </div>

        <!-- Scrollable records list -->
        <div class="flex min-h-0 flex-col px-2 md:px-4">
          <RecordsList
            :transaction-type="transactionType"
            :on-select="onSelectValue"
            :selected-transactions="selectedTransactions"
            :multi-select="selectedOption === 'refunded'"
            :origin-amount="currentAmount"
            :origin-account-id="currentAccountId"
            :origin-transaction-id="currentTransactionId"
          />
        </div>

        <!-- Footer -->
        <div class="border-border bg-dialog flex items-center gap-3 border-t px-4 py-3 md:px-6">
          <p :class="['min-w-0 text-[13px]', totals.isOverLimit ? 'text-destructive-text' : 'text-muted-foreground']">
            {{ summaryText }}
          </p>
          <Button class="ml-auto min-w-25 shrink-0" :disabled="isSaveDisabled" @click="saveState">
            {{ $t('dialogs.manageTransaction.markAsRefund.saveButton') }}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>

    <!-- Split Selection Dialog -->
    <ResponsiveDialog
      v-model:open="isSplitDialogOpen"
      custom-close
      dialog-content-class="max-w-md"
      drawer-content-class="max-h-[85dvh]"
    >
      <template #title>
        <span class="flex items-center gap-2">
          <SplitIcon class="text-muted-foreground size-4" />
          {{ $t('dialogs.manageTransaction.markAsRefund.selectWhichPartToRefund') }}
        </span>
      </template>
      <template #description>
        {{ $t('dialogs.manageTransaction.markAsRefund.transactionSplitInfo') }}
      </template>

      <template v-if="pendingTransaction">
        <p v-if="hasSmallOptions && currentAmount" class="text-warning-text mb-4 text-xs italic">
          <template v-if="isSameCurrency">
            {{ $t('dialogs.manageTransaction.markAsRefund.amountTooSmallWarning') }}
            {{ formatUIAmount(currentAmount, { currency: currentCurrencyCode }) }}
            {{ $t('dialogs.manageTransaction.markAsRefund.amountDisabled') }}
          </template>
          <template v-else>
            {{ $t('dialogs.manageTransaction.markAsRefund.amountMayBeSmaller') }} ({{
              formatUIAmount(currentAmount, { currency: currentCurrencyCode })
            }}). {{ $t('dialogs.manageTransaction.markAsRefund.finalValidationWarning') }}
          </template>
        </p>

        <div class="space-y-2">
          <!-- Main category (remaining amount) -->
          <button
            type="button"
            :disabled="shouldDisableOption(isMainCategoryTooSmall)"
            :class="[
              'border-border flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
              shouldDisableOption(isMainCategoryTooSmall) ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/50',
              tempSplitSelection?.splitId === null &&
                !shouldDisableOption(isMainCategoryTooSmall) &&
                'border-primary bg-primary/10',
            ]"
            @click="!shouldDisableOption(isMainCategoryTooSmall) && selectTempSplit(null)"
          >
            <div class="flex items-center gap-2">
              <div
                class="size-3 shrink-0 rounded-full"
                :style="{ backgroundColor: getMainCategoryInfo(pendingTransaction).color }"
              />
              <span :class="['text-sm font-medium', shouldDisableOption(isMainCategoryTooSmall) && 'line-through']">
                {{ getMainCategoryInfo(pendingTransaction).name }}
              </span>
              <span class="text-muted-foreground text-xs">
                {{ $t('dialogs.manageTransaction.markAsRefund.mainCategoryLabel') }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span :class="['text-sm tabular-nums', isMainCategoryTooSmall && 'text-warning-text']">
                {{
                  formatUIAmount(getMainCategoryInfo(pendingTransaction).amount, {
                    currency: pendingTransaction.currencyCode,
                  })
                }}
              </span>
              <CheckIcon v-if="tempSplitSelection?.splitId === null" class="text-primary-text size-4" />
            </div>
          </button>

          <!-- Splits -->
          <button
            v-for="split in pendingTransaction.splits"
            :key="split.id"
            type="button"
            :disabled="shouldDisableOption(isSplitTooSmall(split))"
            :class="[
              'border-border flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
              shouldDisableOption(isSplitTooSmall(split)) ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/50',
              tempSplitSelection?.splitId === split.id &&
                !shouldDisableOption(isSplitTooSmall(split)) &&
                'border-primary bg-primary/10',
            ]"
            @click="!shouldDisableOption(isSplitTooSmall(split)) && selectTempSplit(split.id)"
          >
            <div class="flex items-center gap-2">
              <div
                class="size-3 shrink-0 rounded-full"
                :style="{ backgroundColor: getSplitCategoryInfo(split).color }"
              />
              <span :class="['text-sm font-medium', shouldDisableOption(isSplitTooSmall(split)) && 'line-through']">
                {{ getSplitCategoryInfo(split).name }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span :class="['text-sm tabular-nums', isSplitTooSmall(split) && 'text-warning-text']">
                {{ formatUIAmount(split.amount, { currency: pendingTransaction.currencyCode }) }}
              </span>
              <CheckIcon v-if="tempSplitSelection?.splitId === split.id" class="text-primary-text size-4" />
            </div>
          </button>
        </div>

        <div class="mt-6 flex justify-end">
          <Button :disabled="isSplitConfirmDisabled" @click="confirmSplitSelection">
            {{ $t('dialogs.manageTransaction.markAsRefund.confirmButton') }}
          </Button>
        </div>
      </template>
    </ResponsiveDialog>
  </div>
</template>
