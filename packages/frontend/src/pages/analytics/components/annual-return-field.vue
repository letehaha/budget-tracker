<template>
  <div>
    <SelectField
      :model-value="selectedOption"
      :values="options"
      :option-disabled="isOptionDisabled"
      :label="hideLabel ? undefined : $t('analytics.investmentCalculator.annualReturn')"
      :placeholder="$t('analytics.investmentCalculator.annualReturnPlaceholder')"
      label-key="label"
      value-key="id"
      @update:model-value="handleChange($event)"
    />

    <div v-if="indicatorId === CUSTOM_INDICATOR_ID" class="mt-2">
      <InputField
        :model-value="rate"
        type="number"
        :aria-label="$t('analytics.investmentCalculator.annualReturn')"
        :placeholder="$t('analytics.investmentCalculator.customReturnRate')"
        @update:model-value="onRateInput({ value: $event })"
        @blur="onRateBlur({ event: $event })"
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
  buildReturnOptions,
  CUSTOM_INDICATOR_ID,
  MARKET_INDICATORS,
  type ReturnOption,
} from '@/pages/analytics/utils/market-indicators';
import { getPortfolioIdFromIndicatorId, isPortfolioIndicatorId } from '@bt/shared/types';

const props = defineProps<{
  indicatorId: string;
  rate: number | null;
  formatPresetLabel?: (params: { label: string; nominalPct: number }) => string;
  hideLabel?: boolean;
}>();

const emit = defineEmits<{
  'update:indicatorId': [value: string];
  'update:rate': [value: number];
}>();

const { t } = useI18n();

const { data: portfolioReturnsData } = usePortfoliosAnnualizedReturns();
const portfolioReturns = computed(() => portfolioReturnsData.value ?? []);

// A number input part-way through "6." or cleared reports '', which must not overwrite the last valid rate.
const onRateInput = ({ value }: { value: string | number | null }) => {
  if (value === null || value === '') return;
  const rate = Number(value);
  if (Number.isFinite(rate)) emit('update:rate', rate);
};

// The ignored '' never reaches the model, so InputField has no change to re-render; restore the rate in use.
const onRateBlur = ({ event }: { event: FocusEvent }) => {
  const input = event.target as HTMLInputElement;
  if (input.value === '' && props.rate !== null) input.value = String(props.rate);
};

const options = computed(() =>
  buildReturnOptions({ portfolioReturns: portfolioReturns.value, t, formatPresetLabel: props.formatPresetLabel }),
);

const selectedOption = computed(() => options.value.find((option) => option.id === props.indicatorId) ?? null);

const isOptionDisabled = (option: ReturnOption): boolean => option.disabled === true;

const handleChange = (option: ReturnOption | null) => {
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
