<template>
  <Card class="mb-8">
    <CardContent class="md:flex-center flex flex-wrap gap-4 pt-6!">
      <div class="w-full max-w-[300px] shrink-0">
        <select-field
          v-model="selectedCurrency"
          :values="filteredCurrencies"
          :placeholder="
            isCurrenciesLoading
              ? $t('settings.currencies.addNew.loading')
              : $t('settings.currencies.addNew.selectCurrency')
          "
          value-key="code"
          with-search
          :disabled="!filteredCurrencies.length"
          :label-key="(item: CurrencyModel) => formatCurrencyLabel({ code: item.code, fallbackName: item.currency })"
        />
      </div>
      <Button :disabled="!selectedCurrency || isCurrenciesLoading" class="min-w-[100px]" @click="addCurrency">
        {{ $t('settings.currencies.addNew.addButton') }}
      </Button>

      <Tooltip.TooltipProvider>
        <Tooltip.Tooltip>
          <Tooltip.TooltipTrigger class="flex items-center gap-2">
            <InfoIcon class="size-6" />
            {{ $t('settings.currencies.addNew.howItWorks') }}
          </Tooltip.TooltipTrigger>
          <Tooltip.TooltipContent class="max-w-[400px] p-4">
            <span class="text-sm leading-6 opacity-90">
              {{ $t('settings.currencies.addNew.tooltip') }}
            </span>
          </Tooltip.TooltipContent>
        </Tooltip.Tooltip>
      </Tooltip.TooltipProvider>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { addUserCurrencies } from '@/api/currencies';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { SelectField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { Card, CardContent } from '@/components/lib/ui/card';
import * as Tooltip from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useCurrencyName } from '@/composable';
import { useCurrenciesStore } from '@/stores';
import { CurrencyModel } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { InfoIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const currenciesStore = useCurrenciesStore();
const { addErrorNotification } = useNotificationCenter();
const { currencies: userCurrencies, systemCurrencies } = storeToRefs(currenciesStore);
const queryClient = useQueryClient();
const { t } = useI18n();
const { formatCurrencyLabel } = useCurrencyName();

const isCurrenciesLoading = ref(false);
const selectedCurrency = ref<CurrencyModel | null>(null);
const filteredCurrencies = computed(() =>
  systemCurrencies.value.filter((item) => !userCurrencies.value.some((el) => el.currency?.code === item.code)),
);

const addCurrency = async () => {
  try {
    if (!selectedCurrency.value) return;

    isCurrenciesLoading.value = true;

    await addUserCurrencies([{ currencyCode: selectedCurrency.value.code }]);

    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.exchangeRates,
    });
    await currenciesStore.loadCurrencies();
  } catch {
    addErrorNotification(t('settings.currencies.addNew.errors.addFailed'));
  } finally {
    isCurrenciesLoading.value = false;
  }
};
</script>
