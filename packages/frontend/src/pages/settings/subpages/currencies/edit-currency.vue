<template>
  <div>
    <div class="grid w-full grid-cols-2 gap-4">
      <input-field
        v-model="form.baseRate"
        :label="`1 ${currency.currency.code} =`"
        :disabled="isLiveRateEnabled"
        @focus="onBaseFocus"
      />
      <input-field
        v-model="form.quoteRate"
        :label="`1 ${currency.quoteCode} =`"
        :disabled="isLiveRateEnabled"
        @focus="onQuoteFocus"
      />
    </div>

    <div class="my-4 h-px w-full bg-white/20" />

    <div class="flex items-center justify-between gap-4">
      <p class="text-sm opacity-90">
        Disable live updation to be able to set custom exchange rate.
        <br />
        <span class="inline-flex items-center gap-1">
          <InfoIcon class="text-primary inline size-4" /> When enabled, custom rate is ignored.
        </span>
      </p>

      <label class="flex w-max cursor-pointer items-center">
        <span class="mr-2.5 w-max">Live update</span>
        <Checkbox :checked="isLiveRateEnabled" @update:checked="toggleChange($event)" />
      </label>
    </div>

    <div class="my-4 h-px w-full bg-white/20" />

    <div class="border-destructive -mx-3 rounded-lg border p-3">
      <div class="flex items-center justify-between gap-4">
        <p class="text-sm opacity-90">
          Currency can only be deleted/disconnected if there's no accounts and/or transactions associated with it.
        </p>

        <ui-tooltip :content="deletionDisabled ? DISABLED_DELETE_TEXT : ''" position="top">
          <Button variant="destructive" :disabled="deletionDisabled" @click="onDeleteHandler">
            Delete currency

            <InfoIcon class="size-4" v-if="deletionDisabled" />
          </Button>
        </ui-tooltip>
      </div>

      <div class="my-4 h-px w-full bg-white/20" />

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
          :disabled="changeBaseCurrencyMutation.isPending.value"
          class="min-w-[171px]"
        >
          <template v-if="changeBaseCurrencyMutation.isPending.value"> Processing... </template>
          <template v-else> Set as base currency </template>
        </Button>
      </div>
    </div>

    <Button class="mt-8 w-full" @click="onSubmitHandler"> Save </Button>

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
                    Currency conversions use <strong>Banker's Rounding (IEEE 754 standard)</strong>, also known as
                    "round half to even". This minimizes cumulative rounding errors over many calculations.
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
              You won't be able to create new accounts, transactions, and anything related to "amounts" while the
              process is in progress.
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
  </div>
</template>

<script setup lang="ts">
import { deleteCustomRate, editUserCurrenciesExchangeRates } from '@/api/currencies';
import UiTooltip from '@/components/common/tooltip.vue';
import InputField from '@/components/fields/input-field.vue';
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import Button from '@/components/lib/ui/button/Button.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import * as Collapsible from '@/components/lib/ui/collapsible';
import { useNotificationCenter } from '@/components/notification-center';
import { useChangeBaseCurrency } from '@/composable/data-queries/currencies';
import { useCurrenciesStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types';
import { ChevronDownIcon, InfoIcon, TriangleAlertIcon } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import { CurrencyWithExchangeRate } from './types';

const DISABLED_DELETE_TEXT = 'You cannot delete this currency because it is still connected to account(s).';
const calculateRatio = (value: number) => {
  const exp = 10 ** 6;
  const num = 1 / value;
  const result = Math.round(num * exp) / exp;

  return Number.isFinite(result) ? result : 0;
};

const props = defineProps<{
  currency: CurrencyWithExchangeRate;
  deletionDisabled: boolean;
}>();

const emit = defineEmits<{
  submit: [];
  delete: [];
}>();

const currenciesStore = useCurrenciesStore();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const changeBaseCurrencyMutation = useChangeBaseCurrency();

const form = reactive({
  baseRate: props.currency.rate,
  quoteRate: props.currency.quoteRate,
});
const isBaseEditing = ref(false);
const isQuoteEditing = ref(false);
const isLiveRateEnabled = ref<boolean>(!props.currency.custom);
const showBaseCurrencyDialog = ref(false);
const showRoundingDetails = ref(false);

const isRateChanged = computed(
  () => +props.currency.rate !== +form.baseRate || +props.currency.quoteRate !== +form.quoteRate,
);

const onBaseFocus = () => {
  isBaseEditing.value = true;
  isQuoteEditing.value = false;
};
const onQuoteFocus = () => {
  isQuoteEditing.value = true;
  isBaseEditing.value = false;
};
const toggleChange = (value: boolean) => {
  isLiveRateEnabled.value = value;
};

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

const onDeleteHandler = () => {
  emit('delete');
};

const deleteExchangeRates = async () => {
  try {
    await deleteCustomRate([
      {
        baseCode: props.currency.currency.code,
        quoteCode: props.currency.quoteCode,
      },
      {
        baseCode: props.currency.quoteCode,
        quoteCode: props.currency.currency.code,
      },
    ]);

    emit('submit');

    addSuccessNotification('Successfully updated.');
  } catch (e) {
    if (e.data.code === API_ERROR_CODES.validationError) {
      addErrorNotification(e.data.message);
      return;
    }
    addErrorNotification('Unexpected error');
  }
};

const updateExchangeRates = async () => {
  try {
    await editUserCurrenciesExchangeRates([
      {
        baseCode: props.currency.currency.code,
        quoteCode: props.currency.quoteCode,
        rate: Number(form.baseRate),
      },
      {
        baseCode: props.currency.quoteCode,
        quoteCode: props.currency.currency.code,
        rate: Number(form.quoteRate),
      },
    ]);
    await currenciesStore.loadCurrencies();

    emit('submit');

    addSuccessNotification('Successfully updated.');
  } catch (e) {
    if (e.data.code === API_ERROR_CODES.validationError) {
      addErrorNotification(e.data.message);
      return;
    }
    addErrorNotification('Unexpected error. Currency is not updated.');
  }
};

const makeBaseCurrency = async () => {
  try {
    await changeBaseCurrencyMutation.mutateAsync(props.currency.currency.code);
    addSuccessNotification('Base currency changed successfully.');
    emit('submit');
  } catch (e) {
    if (e.data?.code === API_ERROR_CODES.validationError) {
      addErrorNotification(e.data.message);
      return;
    }
    addErrorNotification('Unexpected error. Failed to change base currency.');
  }
};

const onSubmitHandler = async () => {
  if (!isLiveRateEnabled.value && isRateChanged.value) {
    await updateExchangeRates();
  } else if (isLiveRateEnabled.value) {
    await deleteExchangeRates();
  }
};
</script>
