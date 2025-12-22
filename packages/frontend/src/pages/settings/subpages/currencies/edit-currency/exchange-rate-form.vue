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

      <label
        class="flex w-max cursor-pointer items-center aria-disabled:cursor-default"
        :aria-disabled="isFormDisabled"
      >
        <span class="mr-2.5 w-max">Live update</span>
        <Checkbox
          :model-value="isLiveRateEnabled"
          :disabled="isFormDisabled"
          @update:model-value="toggleChange(Boolean($event))"
        />
      </label>
    </div>

    <Button v-if="shouldShowSaveButton" class="mt-8 w-full" @click="onSubmitHandler" :disabled="isFormDisabled">
      Save
    </Button>
  </div>
</template>

<script setup lang="ts">
import { deleteCustomRate, editUserCurrenciesExchangeRates } from '@/api/currencies';
import InputField from '@/components/fields/input-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { useCurrenciesStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types';
import { InfoIcon } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

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

const currenciesStore = useCurrenciesStore();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const form = reactive({
  baseRate: props.currency.rate,
  quoteRate: props.currency.quoteRate,
});
const isBaseEditing = ref(false);
const isQuoteEditing = ref(false);
const isLiveRateEnabled = ref<boolean>(!props.currency.custom);

const isRateChanged = computed(
  () => +props.currency.rate !== +form.baseRate || +props.currency.quoteRate !== +form.quoteRate,
);

const shouldShowSaveButton = computed(() => {
  return (!isLiveRateEnabled.value && isRateChanged.value) || (isLiveRateEnabled.value && props.currency.custom);
});

const onBaseFocus = () => {
  isBaseEditing.value = true;
  isQuoteEditing.value = false;
};
const onQuoteFocus = () => {
  isQuoteEditing.value = true;
  isBaseEditing.value = false;
};
const toggleChange = (value: boolean) => {
  if (props.isFormDisabled) return;
  isLiveRateEnabled.value = !!value;
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

const onSubmitHandler = async () => {
  emit('trigger-disabled', true);
  if (!isLiveRateEnabled.value && isRateChanged.value) {
    await updateExchangeRates();
  } else if (isLiveRateEnabled.value) {
    await deleteExchangeRates();
  }
  emit('trigger-disabled', false);
};
</script>
