<script lang="ts" setup>
import FormWrapper from '@/components/fields/form-wrapper.vue';
import SelectField from '@/components/fields/select-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { useCurrencyName } from '@/composable';
import { useLogout } from '@/composable/actions/logout';
import { useAllCurrencies, useBaseCurrency, useSetBaseCurrency } from '@/composable/data-queries/currencies';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ROUTES_NAMES } from '@/routes/constants';
import { CurrencyModel } from '@bt/shared/types';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

onMounted(() => {
  trackAnalyticsEvent({ event: 'onboarding_visited' });
});

const router = useRouter();
const logoutHandler = useLogout();
const { t } = useI18n();
const { formatCurrencyLabel } = useCurrencyName();

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
watch(isErrorLoadingCurrencies, () => (formError.value = t('auth.welcome.errors.unableToLoadCurrencies')));
watch(baseCurrency, (value) => {
  if (value) forwardToDashboard();
});

const isFormDisabled = computed(() => isCurrenciesLoading.value || isSubmitting.value);

const submitBaseCurrency = () => {
  if (!selectedCurrency.value) return;

  formError.value = null;
  setBaseCurrency(selectedCurrency.value.code, {
    onSuccess: () => {
      trackAnalyticsEvent({
        event: 'onboarding_completed',
        properties: { base_currency: selectedCurrency.value!.code },
      });
      forwardToDashboard();
    },
    onError: () => {
      formError.value = t('auth.welcome.errors.unableToSetCurrency');
    },
  });
};
</script>

<template>
  <div class="flex min-h-screen flex-col px-4">
    <div class="flex justify-end px-6 pt-4 pr-40">
      <Button theme="primary" class="sidebar__logout" @click="logoutHandler"> {{ $t('auth.welcome.logout') }} </Button>
    </div>

    <div class="flex flex-auto items-center justify-center">
      <div class="max-w-112.5">
        <h1 class="text-center">{{ $t('auth.welcome.title') }}</h1>

        <form-wrapper :error="formError">
          <div class="my-6">
            <select-field
              :key="currencies.length"
              v-model="selectedCurrency"
              :values="currencies"
              value-key="code"
              :placeholder="$t('auth.welcome.placeholders.loading')"
              :label="$t('auth.welcome.labels.baseCurrency')"
              with-search
              :disabled="isFormDisabled"
              :label-key="
                (item: CurrencyModel) => formatCurrencyLabel({ code: item.code, fallbackName: item.currency })
              "
            />
          </div>
          <p class="mt-3 mb-14 text-sm">
            {{ $t('auth.welcome.description') }}
          </p>
          <Button class="w-full" :disabled="isFormDisabled" @click="submitBaseCurrency">
            {{ $t('auth.welcome.submitButton') }}
          </Button>
        </form-wrapper>
      </div>
    </div>
  </div>
</template>
