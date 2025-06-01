<script lang="ts" setup>
import { getAllCurrencies } from '@/api/currencies';
import FormWrapper from '@/components/fields/form-wrapper.vue';
import SelectField from '@/components/fields/select-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAuthStore, useCurrenciesStore } from '@/stores';
import { CurrencyModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const currenciesStore = useCurrenciesStore();
const { logout } = useAuthStore();
const { setBaseCurrency, loadBaseCurrency } = useCurrenciesStore();
const { addErrorNotification } = useNotificationCenter();

const { baseCurrency } = storeToRefs(currenciesStore);

const currencies = ref<CurrencyModel[]>([]);

const selectedCurrency = ref<CurrencyModel | null>(null);
const isCurrenciesLoading = ref(false);
const isSubmitting = ref(false);
const formError = ref<string | null>(null);

const forwardToDashboard = () => {
  router.push({ name: ROUTES_NAMES.home });
};

watch(selectedCurrency, () => {
  formError.value = null;
});

const loadCurrencies = async () => {
  try {
    isCurrenciesLoading.value = true;

    currencies.value = await getAllCurrencies();

    if (!selectedCurrency.value) {
      selectedCurrency.value = currencies.value[0];
    }
  } catch {
    addErrorNotification('Unexpected error. Cannot load currencies.');
  } finally {
    isCurrenciesLoading.value = false;
  }
};

const submitBaseCurrency = async () => {
  if (!selectedCurrency.value) return;

  try {
    formError.value = null;
    isSubmitting.value = true;

    await setBaseCurrency(selectedCurrency.value.id);

    forwardToDashboard();
  } catch {
    formError.value = 'Unexpected error. Cannot set base currency. Please try later or contact support.';
  } finally {
    isSubmitting.value = false;
  }
};

const logOutHandler = () => {
  logout();
  router.push({ name: ROUTES_NAMES.signIn });
};

const checkBaseCurrencyExisting = async () => {
  await loadBaseCurrency();

  if (baseCurrency.value) {
    forwardToDashboard();
  }
};

if (baseCurrency.value) {
  forwardToDashboard();
} else {
  checkBaseCurrencyExisting();
}

loadCurrencies();
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <div class="flex justify-end px-6 py-3">
      <ui-button theme="primary" class="sidebar__logout" @click="logOutHandler"> Logout </ui-button>
    </div>

    <div class="flex flex-auto items-center justify-center">
      <div class="max-w-[450px]">
        <h1 class="text-center">Select Base Currency</h1>

        <form-wrapper :error="formError">
          <div class="my-6">
            <select-field
              v-model="selectedCurrency"
              :values="currencies"
              value-key="id"
              placeholder="Loading..."
              label="Base Currency"
              with-search
              :label-key="(item) => `${item.code} - ${item.currency}`"
            />
          </div>
          <p class="mb-14 mt-3 text-sm">
            Your base currency should ideally be the one you use most often. All transactions in other currencies will
            be calculated based on this one. You won't be able to change your base currency later (for now).
          </p>
          <Button class="w-full" :disabled="isCurrenciesLoading" @click="submitBaseCurrency"> Confirm Currency </Button>
        </form-wrapper>
      </div>
    </div>
  </div>
</template>
