<script lang="ts" setup>
import FormWrapper from '@/components/fields/form-wrapper.vue';
import SelectField from '@/components/fields/select-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { useLogout } from '@/composable/actions/logout';
import { useAllCurrencies, useBaseCurrency, useSetBaseCurrency } from '@/composable/data-queries/currencies';
import { ROUTES_NAMES } from '@/routes/constants';
import { CurrencyModel } from '@bt/shared/types';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const logoutHandler = useLogout();

const selectedCurrency = ref<CurrencyModel | null>(null);
const formError = ref<string | null>(null);
const forwardToDashboard = () => {
  router.push({ name: ROUTES_NAMES.home });
};

const { data: allCurrencies, isLoading: isCurrenciesLoading, isError: isErrorLoadingCurrencies } = useAllCurrencies();
const { data: baseCurrency } = useBaseCurrency();
const { mutate: setBaseCurrency, isPending: isSubmitting } = useSetBaseCurrency();

// Sort currencies with priority currencies first (USD, EUR, UAH, PLN)
const currencies = computed(() => {
  if (!allCurrencies.value || allCurrencies.value.length === 0) return [];

  const priorityCurrencies = ['USD', 'EUR', 'UAH', 'PLN'];
  const priority: CurrencyModel[] = [];
  const others: CurrencyModel[] = [];

  allCurrencies.value.forEach((currency) => {
    if (priorityCurrencies.includes(currency.code)) {
      priority.push(currency);
    } else {
      others.push(currency);
    }
  });

  // Sort priority currencies by their order in the priorityCurrencies array
  priority.sort((a, b) => priorityCurrencies.indexOf(a.code) - priorityCurrencies.indexOf(b.code));

  return [...priority, ...others];
});

watch(selectedCurrency, () => (formError.value = null));
watch(currencies, () => (selectedCurrency.value = currencies.value[0]));
watch(isErrorLoadingCurrencies, () => (formError.value = 'Unable to load currencies list. Try later'));
watch(baseCurrency, (value) => {
  if (value) forwardToDashboard();
});

const isFormDisabled = computed(() => isCurrenciesLoading.value || isSubmitting.value);

const submitBaseCurrency = () => {
  if (!selectedCurrency.value) return;

  formError.value = null;
  setBaseCurrency(selectedCurrency.value.code, {
    onSuccess: () => {
      forwardToDashboard();
    },
    onError: () => {
      formError.value = 'Unexpected error. Cannot set base currency. Please try later or contact support.';
    },
  });
};
</script>

<template>
  <div class="flex min-h-screen flex-col px-4">
    <div class="flex justify-end px-6 py-3">
      <Button theme="primary" class="sidebar__logout" @click="logoutHandler"> Logout </Button>
    </div>

    <div class="flex flex-auto items-center justify-center">
      <div class="max-w-[450px]">
        <h1 class="text-center">Select Base Currency</h1>

        <form-wrapper :error="formError">
          <div class="my-6">
            <select-field
              :key="currencies.length"
              v-model="selectedCurrency"
              :values="currencies"
              value-key="code"
              placeholder="Loading..."
              label="Base Currency"
              with-search
              :disabled="isFormDisabled"
              :label-key="(item) => `${item.code} - ${item.currency}`"
            />
          </div>
          <p class="mt-3 mb-14 text-sm">
            Your base currency should ideally be the one you use most often. All transactions in other currencies will
            be calculated based on this one. You won't be able to change your base currency later (for now).
          </p>
          <Button class="w-full" :disabled="isFormDisabled" @click="submitBaseCurrency"> Confirm Currency </Button>
        </form-wrapper>
      </div>
    </div>
  </div>
</template>
