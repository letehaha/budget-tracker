<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { useAccountsStore } from '@/stores';
import {
  AUTOMATION_LIMITS,
  type AutomationAmountCurrency,
  type AutomationCondition,
  type AutomationConditionField,
  type AutomationConditions,
} from '@bt/shared/types';
import { PlusIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { CONDITION_REGISTRY } from './condition-registry';
import ConditionRow from './condition-row.vue';

const props = defineProps<{ modelValue: AutomationConditions; errors: (string | null)[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: AutomationConditions] }>();

const { t } = useI18n();
const { accountsRecord } = storeToRefs(useAccountsStore());

const joinLabel = computed(() =>
  props.modelValue.match === 'all' ? t('automations.editor.joinAnd') : t('automations.editor.joinOr'),
);

/** A rule may pin the transaction type only once, so a second row cannot offer it. */
const disabledFields = computed<AutomationConditionField[]>(() =>
  props.modelValue.items.some((item) => item.field === 'transactionType') ? ['transactionType'] : [],
);

// Rows carry a stable local key so removing one doesn't leave the next row bound to the
// removed row's component state (a half-typed keyword chip, for one).
let keySeed = 0;
const nextKey = () => (keySeed += 1);
const keys = ref(props.modelValue.items.map(nextKey));

watch(
  () => props.modelValue.items.length,
  (length) => {
    if (length !== keys.value.length) keys.value = props.modelValue.items.map(nextKey);
  },
);

const setItems = ({ items }: { items: AutomationCondition[] }) =>
  emit('update:modelValue', { ...props.modelValue, items });

const replaceAt = ({ index, condition }: { index: number; condition: AutomationCondition }) =>
  setItems({ items: props.modelValue.items.map((item, i) => (i === index ? condition : item)) });

/** A rule scoped to a single account is almost always about that account's own currency. */
const preferredCurrency = (): AutomationAmountCurrency => {
  const scoped = props.modelValue.items.filter(
    (item): item is Extract<AutomationCondition, { field: 'account' }> =>
      item.field === 'account' && item.operator === 'in',
  );
  const accountId = scoped.length === 1 && scoped[0]!.value.length === 1 ? scoped[0]!.value[0]! : undefined;
  const code = accountId ? accountsRecord.value[accountId]?.currencyCode : undefined;
  return code ? { mode: 'specific', code } : { mode: 'transaction' };
};

const changeField = ({ index, field }: { index: number; field: AutomationConditionField }) => {
  const condition = CONDITION_REGISTRY[field].defaultValue();
  if (condition.field === 'amount') condition.currency = preferredCurrency();
  keys.value[index] = nextKey();
  replaceAt({ index, condition });
};

const addCondition = () => {
  keys.value.push(nextKey());
  setItems({ items: [...props.modelValue.items, CONDITION_REGISTRY.note.defaultValue()] });
};

const removeAt = ({ index }: { index: number }) => {
  keys.value.splice(index, 1);
  setItems({ items: props.modelValue.items.filter((_, i) => i !== index) });
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="modelValue.items.length" class="border-border divide-border divide-y rounded-lg border">
      <template v-for="(item, index) in modelValue.items" :key="keys[index]">
        <div v-if="index > 0" class="bg-muted/40 px-3 py-0.5">
          <span class="text-muted-foreground text-xs font-medium">{{ joinLabel }}</span>
        </div>
        <ConditionRow
          :model-value="item"
          :error-message="errors[index]"
          :disabled-fields="disabledFields"
          @update:model-value="(condition) => replaceAt({ index, condition })"
          @update:field="(field) => changeField({ index, field })"
          @remove="removeAt({ index })"
        />
      </template>
    </div>

    <Button
      type="button"
      variant="outline"
      size="sm"
      class="self-start border-dashed"
      :disabled="modelValue.items.length >= AUTOMATION_LIMITS.maxConditions"
      @click="addCondition"
    >
      <PlusIcon class="size-4" />
      {{ $t('automations.editor.addCondition') }}
    </Button>
  </div>
</template>
