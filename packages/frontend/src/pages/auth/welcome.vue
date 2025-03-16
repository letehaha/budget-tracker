<template>
  <div class="welcome">
    <div class="welcome__header">
      <ui-button theme="primary" class="sidebar__logout" @click="logOutHandler"> Logout </ui-button>
    </div>

    <div class="welcome__content">
      <div class="welcome__form">
        <h1 class="welcome__title">Select Base Currency</h1>

        <form-wrapper :error="formError">
          <div class="welcome__currency-selector">
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
          <p class="welcome__disclaimer">
            Your base currency should ideally be the one you use most often. All transactions in other currencies will
            be calculated based on this one. You won't be able to change your base currency later (for now).
          </p>
          <ui-button class="welcome__submit" :disabled="isCurrenciesLoading" @click="submitBaseCurrency">
            Confirm Currency
          </ui-button>
        </form-wrapper>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { getAllCurrencies } from '@/api/currencies';
import UiButton from '@/components/common/ui-button.vue';
import FormWrapper from '@/components/fields/form-wrapper.vue';
import SelectField from '@/components/fields/select-field.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAuthStore, useCurrenciesStore } from '@/stores';
import { CurrencyModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { defineComponent, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

export default defineComponent({
  components: {
    FormWrapper,
    SelectField,
    UiButton,
  },
  setup() {
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
      } catch (e) {
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

    return {
      selectedCurrency,
      isCurrenciesLoading,
      currencies,
      formError,
      logOutHandler,
      submitBaseCurrency,
    };
  },
});
</script>

<style lang="scss" scoped>
.welcome {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.welcome__content {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: auto;
}
.welcome__form {
  max-width: 450px;
}
.welcome__title {
  text-align: center;
}
.welcome__currency-selector {
  margin: 24px 0;
}
.welcome__disclaimer {
  margin: 12px 0 60px;
  font-size: 14px;
}
.welcome__submit {
  width: 100%;
}
.welcome__header {
  padding: 12px 24px;
  display: flex;
  justify-content: flex-end;
}
</style>
