<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import { useCurrencyName } from '@/composable';
import { useCurrenciesStore } from '@/stores';
import type { CurrencyModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: string | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

const { t } = useI18n();
const { formatCurrencyLabel } = useCurrencyName();
const { systemCurrenciesVerbose } = storeToRefs(useCurrenciesStore());

// Currencies the user already uses first, then the rest.
const options = computed<CurrencyModel[]>(() => [
  ...systemCurrenciesVerbose.value.linked,
  ...systemCurrenciesVerbose.value.unlinked,
]);

const selected = computed(() => options.value.find((item) => item.code === props.modelValue) ?? null);

const labelOf = (item: CurrencyModel) => formatCurrencyLabel({ code: item.code, fallbackName: item.currency });
</script>

<template>
  <SelectField
    :model-value="selected"
    :values="options"
    :label-key="labelOf"
    value-key="code"
    with-search
    :disabled="disabled"
    :placeholder="t('pages.integrations.common.currencyPicker.placeholder')"
    @update:model-value="(value) => emit('update:modelValue', value ? value.code : null)"
  />
</template>
