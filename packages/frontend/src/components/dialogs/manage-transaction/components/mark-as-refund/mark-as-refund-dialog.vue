<script lang="ts" setup>
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/lib/ui/radio-group';
import { useExchangeRates } from '@/composable/data-queries/currencies';
import { formatUIAmount } from '@/js/helpers';
import { useCategoriesStore } from '@/stores';
import { TRANSACTION_TYPES, TransactionModel, TransactionSplitModel } from '@bt/shared/types';
import { CheckIcon, SplitIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';

import { RefundedByAnotherTxs, RefundsAnoterTx } from '../../types';
import MarkAsRefundInfoPopover from './mark-as-refund-info-popover.vue';
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
  /** Current account ID (for recommendations) */
  currentAccountId?: number | null;
  /** Current transaction ID (for recommendations when editing) */
  currentTransactionId?: number;
}>();

const emit = defineEmits<{
  'update:refunds': [value: RefundsAnoterTx];
  'update:refundedBy': [value: RefundedByAnotherTxs];
}>();

const { categoriesMap } = storeToRefs(useCategoriesStore());
const { ratesMap } = useExchangeRates();

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

const isSaveDisabled = computed(() => {
  return selectionState.refunds === undefined && selectionState.refundedBy === undefined;
});

const isDialogOpen = ref(false);
const isSplitDialogOpen = ref(false);

const selectedOption = ref<'refunds' | 'refunded'>('refunds');

// Reset state when switching modes
watch(selectedOption, () => {
  selectionState.refunds = undefined;
  selectionState.refundedBy = undefined;
  selectedSplitId.value = null;
  pendingTransaction.value = null;
});

// Reset pending state when main dialog closes
watch(isDialogOpen, (open) => {
  if (!open) {
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
    <!-- Trigger button -->
    <Button class="w-full" :disabled="disabled" variant="secondary" @click="isDialogOpen = true">
      {{ $t('dialogs.manageTransaction.markAsRefund.linkRefund') }}
    </Button>

    <!-- Main Dialog -->
    <ResponsiveDialog
      v-model:open="isDialogOpen"
      custom-close
      no-internal-scroll
      dialog-content-class="grid max-h-[90dvh] grid-rows-[auto_auto_minmax(0,1fr)]"
      drawer-content-class="max-h-[85dvh]"
    >
      <template #title>{{ $t('dialogs.manageTransaction.markAsRefund.selectTransaction') }}</template>
      <template #description>
        <template v-if="selectedOption === 'refunds'">
          <span> {{ $t('dialogs.manageTransaction.markAsRefund.selectRefundingTransaction') }} </span>
        </template>
        <template v-else-if="selectedOption === 'refunded'">
          <span> {{ $t('dialogs.manageTransaction.markAsRefund.selectRefundedByTransactions') }} </span>
        </template>

        <MarkAsRefundInfoPopover />
      </template>

      <div class="mb-4 grid gap-2">
        <div class="flex items-center justify-between">
          <RadioGroup v-model="selectedOption" default-value="refunds" class="flex gap-6">
            <label class="flex cursor-pointer items-center gap-2">
              <RadioGroupItem value="refunds" />
              <p class="text-sm">{{ $t('dialogs.manageTransaction.markAsRefund.refundsLabel') }}</p>
            </label>
            <label
              :class="['flex cursor-pointer items-center gap-2', isRecordCreation && 'cursor-not-allowed opacity-70']"
            >
              <RadioGroupItem :disabled="isRecordCreation" value="refunded" />
              <p class="text-sm">{{ $t('dialogs.manageTransaction.markAsRefund.refundedByLabel') }}</p>
            </label>
          </RadioGroup>

          <Button :disabled="isSaveDisabled" @click="saveState">
            {{ $t('dialogs.manageTransaction.markAsRefund.saveButton') }}
          </Button>
        </div>

        <template v-if="selectedOption === 'refunds'">
          <p class="text-muted-foreground text-xs">{{ $t('dialogs.manageTransaction.markAsRefund.selectOnlyOne') }}</p>
        </template>
        <template v-else-if="selectedOption === 'refunded'">
          <p class="text-muted-foreground text-xs">
            {{ $t('dialogs.manageTransaction.markAsRefund.selectMultipleWithLimit') }}
          </p>
        </template>
      </div>

      <!-- Scrollable content area with records list -->
      <div class="flex min-h-0 flex-col overflow-y-auto">
        <RecordsList
          :transaction-type="transactionType"
          :on-select="onSelectValue"
          :selected-transactions="selectedTransactions"
          :origin-amount="currentAmount"
          :origin-account-id="currentAccountId"
          :origin-transaction-id="currentTransactionId"
        />
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
        <p v-if="hasSmallOptions && currentAmount" class="text-warning mb-4 text-xs italic">
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
              <span :class="['text-sm tabular-nums', isMainCategoryTooSmall && 'text-warning']">
                {{
                  formatUIAmount(getMainCategoryInfo(pendingTransaction).amount, {
                    currency: pendingTransaction.currencyCode,
                  })
                }}
              </span>
              <CheckIcon v-if="tempSplitSelection?.splitId === null" class="text-primary size-4" />
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
              <span :class="['text-sm tabular-nums', isSplitTooSmall(split) && 'text-warning']">
                {{ formatUIAmount(split.amount, { currency: pendingTransaction.currencyCode }) }}
              </span>
              <CheckIcon v-if="tempSplitSelection?.splitId === split.id" class="text-primary size-4" />
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
