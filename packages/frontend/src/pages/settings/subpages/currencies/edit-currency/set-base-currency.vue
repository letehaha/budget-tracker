<template>
  <div class="flex items-center justify-between gap-4">
    <p class="flex items-center gap-1 text-sm opacity-90">
      Set as base currency

      <ui-tooltip position="top">
        <template #tooltip-message>
          Mark as a base currency. All statistics and dashboard information will be displayed in this currency.

          <br />
          <br />

          Transactions will be recalculated by exchange rate as of date of when transaction was recorded.
        </template>
        <InfoIcon class="size-4" />
      </ui-tooltip>
    </p>

    <Button
      variant="destructive"
      @click="showBaseCurrencyDialog = true"
      :disabled="isFormDisabled"
      class="min-w-[171px]"
    >
      <template v-if="changeBaseCurrencyMutation.isPending.value"> Processing... </template>
      <template v-else> Set as base currency </template>
    </Button>
  </div>

  <AlertDialog.AlertDialog :open="showBaseCurrencyDialog" @update:open="showBaseCurrencyDialog = $event">
    <AlertDialog.AlertDialogContent>
      <AlertDialog.AlertDialogHeader>
        <AlertDialog.AlertDialogTitle>Change Base Currency?</AlertDialog.AlertDialogTitle>
        <AlertDialog.AlertDialogDescription class="grid gap-4">
          <p>
            <strong class="text-warning font-bold">Warning:</strong> Changing the base currency should be a very
            well-considered decision. Ideally, this action should be performed only once, even though there are no
            actual restrictions.
          </p>

          <p>
            Each time you change the base currency, all transactions will be recalculated using historical exchange
            rates. Because of floating-point arithmetic and normal variations between base and quote currency rates,
            repeated recalculations may introduce small discrepancies in your <i>reference amounts</i> over time.
            <i>Reference amounts</i> are used to display statistics and to set your budget limits.
          </p>

          <Collapsible.Collapsible v-model:open="showRoundingDetails">
            <Collapsible.CollapsibleTrigger class="flex items-center gap-1 text-sm hover:opacity-80">
              <ChevronDownIcon
                class="size-4 transition-transform duration-200"
                :class="{ 'rotate-180': showRoundingDetails }"
              />
              How exactly is rounding calculated?
            </Collapsible.CollapsibleTrigger>
            <Collapsible.CollapsibleContent class="mt-2 text-sm opacity-90">
              <div class="rounded-md bg-white/5 p-3">
                <p class="mb-2">
                  Currency conversions use <strong>Banker's Rounding (IEEE 754 standard)</strong>, also known as "round
                  half to even". This minimizes cumulative rounding errors over many calculations.
                </p>
                <p class="mb-2">
                  <strong>How it works:</strong><br />
                  • When a value is exactly halfway (e.g., 0.5), it rounds to the nearest even number<br />
                  • Example: 0.5 → 0, 1.5 → 2, 2.5 → 2, 3.5 → 4
                </p>
                <p>
                  This method is recommended by IFRS/GAAP accounting standards and used by major financial systems to
                  prevent systematic bias in currency conversions.
                </p>
              </div>
            </Collapsible.CollapsibleContent>
          </Collapsible.Collapsible>

          <strong class="text-warning font-bold">
            <TriangleAlertIcon class="inline size-4 align-text-bottom" />
            Original transactions amount will always remain untouched!
          </strong>

          <strong class="font-bold">
            <InfoIcon class="inline size-4" />
            This might take a while if your currency is not widely-common.
          </strong>

          <strong class="text-warning font-bold">
            <TriangleAlertIcon class="inline size-4" />
            You won't be able to create new accounts, transactions, and anything related to "amounts" while the process
            is in progress.
          </strong>

          <p>Are you sure you want to proceed?</p>
        </AlertDialog.AlertDialogDescription>
      </AlertDialog.AlertDialogHeader>
      <AlertDialog.AlertDialogFooter>
        <AlertDialog.AlertDialogAction variant="destructive" @click="makeBaseCurrency">
          Change Base Currency
        </AlertDialog.AlertDialogAction>

        <AlertDialog.AlertDialogCancel>Cancel</AlertDialog.AlertDialogCancel>
      </AlertDialog.AlertDialogFooter>
    </AlertDialog.AlertDialogContent>
  </AlertDialog.AlertDialog>
</template>

<script setup lang="ts">
import UiTooltip from '@/components/common/tooltip.vue';
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Collapsible from '@/components/lib/ui/collapsible';
import { useNotificationCenter } from '@/components/notification-center';
import { useChangeBaseCurrency } from '@/composable/data-queries/currencies';
import { API_ERROR_CODES } from '@bt/shared/types';
import { ChevronDownIcon, InfoIcon, TriangleAlertIcon } from 'lucide-vue-next';
import { reactive, ref, watch } from 'vue';

import { CurrencyWithExchangeRate } from '../types';

const calculateRatio = (value: number) => {
  const exp = 10 ** 6;
  const num = 1 / value;
  const result = Math.round(num * exp) / exp;

  return Number.isFinite(result) ? result : 0;
};

const props = defineProps<{
  currency: CurrencyWithExchangeRate;
  isFormDisabled: boolean;
}>();

const emit = defineEmits<{
  submit: [];
  'trigger-disabled': [value: boolean];
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const changeBaseCurrencyMutation = useChangeBaseCurrency();

const form = reactive({
  baseRate: props.currency.rate,
  quoteRate: props.currency.quoteRate,
});
const isBaseEditing = ref(false);
const isQuoteEditing = ref(false);
const showBaseCurrencyDialog = ref(false);
const showRoundingDetails = ref(false);

watch(
  () => form.baseRate,
  (value) => {
    if (isBaseEditing.value) {
      form.quoteRate = calculateRatio(value);
    }
  },
);
watch(
  () => form.quoteRate,
  (value) => {
    if (isQuoteEditing.value) {
      form.baseRate = calculateRatio(value);
    }
  },
);

const makeBaseCurrency = async () => {
  try {
    emit('trigger-disabled', true);
    await changeBaseCurrencyMutation.mutateAsync(props.currency.currency.code);

    addSuccessNotification('Base currency changed successfully.');

    emit('trigger-disabled', false);
    emit('submit');
  } catch (e) {
    if (e.data?.code === API_ERROR_CODES.validationError) {
      addErrorNotification(e.data.message);
      return;
    }
    addErrorNotification('Unexpected error. Failed to change base currency.');
  }
};
</script>
