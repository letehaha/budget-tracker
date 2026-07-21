<template>
  <div>
    <SelectField
      :model-value="selectedOption"
      :values="options"
      :option-disabled="isOptionDisabled"
      :label="$t('analytics.investmentCalculator.annualReturn')"
      :placeholder="$t('analytics.investmentCalculator.annualReturnPlaceholder')"
      label-key="label"
      value-key="id"
      @update:model-value="handleChange($event)"
    />

    <!-- Manual rate, shown only when the user picks "Custom". -->
    <div v-if="indicatorId === CUSTOM_INDICATOR_ID" class="mt-2">
      <InputField
        :model-value="rate"
        type="number"
        :placeholder="$t('analytics.investmentCalculator.customReturnRate')"
        @update:model-value="$emit('update:rate', toNumber($event))"
      >
        <template #iconTrailing>
          <PercentIcon class="text-muted-foreground size-4" />
        </template>
      </InputField>
    </div>
  </div>
</template>

<script setup lang="ts">
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import { usePortfoliosAnnualizedReturns } from '@/composable/data-queries/portfolios-annualized-returns';
import { PercentIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  CUSTOM_INDICATOR_ID,
  getPortfolioIdFromIndicatorId,
  isPortfolioIndicatorId,
  makePortfolioIndicatorId,
  MARKET_INDICATORS,
} from '../../investment-calculator/composables/market-indicators';

const props = defineProps<{
  indicatorId: string;
  rate: number;
}>();

const emit = defineEmits<{
  'update:indicatorId': [value: string];
  'update:rate': [value: number];
}>();

const { t } = useI18n();

const { data: portfolioReturnsData } = usePortfoliosAnnualizedReturns();
const portfolioReturns = computed(() => portfolioReturnsData.value ?? []);

interface SelectOption {
  id: string;
  label: string;
  disabled?: boolean;
}

const toNumber = (value: string | number | null): number => {
  if (value === null || value === '') return 0;
  return Number(value) || 0;
};

// The user's own portfolios first (their tracked performance), then the static
// market indices, then the manual "Custom" entry. A portfolio without enough
// history is listed disabled so the option stays discoverable.
const portfolioOptions = computed<SelectOption[]>(() =>
  portfolioReturns.value.map((portfolio) =>
    // `annualizedReturn !== null` is the backend's own "has enough history" gate,
    // so it doubles as the "selectable?" flag here.
    portfolio.annualizedReturn !== null
      ? {
          id: makePortfolioIndicatorId({ portfolioId: portfolio.portfolioId }),
          label: t('analytics.investmentCalculator.portfolioReturnOption', {
            name: portfolio.portfolioName,
            rate: portfolio.annualizedReturn.toFixed(1),
          }),
        }
      : {
          id: makePortfolioIndicatorId({ portfolioId: portfolio.portfolioId }),
          label: t('analytics.investmentCalculator.portfolioNoHistoryOption', { name: portfolio.portfolioName }),
          disabled: true,
        },
  ),
);

const options = computed<SelectOption[]>(() => [
  ...portfolioOptions.value,
  ...MARKET_INDICATORS.map((indicator) => ({
    id: indicator.id,
    label: `${indicator.label} (~${indicator.avgAnnualReturn}%/yr)`,
  })),
  { id: CUSTOM_INDICATOR_ID, label: t('analytics.investmentCalculator.customIndicator') },
]);

const selectedOption = computed(() => options.value.find((option) => option.id === props.indicatorId) ?? null);

const isOptionDisabled = (option: SelectOption): boolean => option.disabled === true;

const handleChange = (option: SelectOption | null) => {
  if (!option || isOptionDisabled(option)) return;
  emit('update:indicatorId', option.id);

  if (isPortfolioIndicatorId({ id: option.id })) {
    const portfolioId = getPortfolioIdFromIndicatorId({ id: option.id });
    const portfolio = portfolioReturns.value.find((entry) => entry.portfolioId === portfolioId);
    if (portfolio && portfolio.annualizedReturn !== null) emit('update:rate', portfolio.annualizedReturn);
    return;
  }

  const indicator = MARKET_INDICATORS.find((entry) => entry.id === option.id);
  if (indicator) emit('update:rate', indicator.avgAnnualReturn);
};
</script>
