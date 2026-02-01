<script setup lang="ts">
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { usePrioritizedCurrencies } from '@/composable/data-queries/prioritized-currencies';
import { useCurrencyName } from '@/composable/formatters';
import { useAccountsStore } from '@/stores';
import type { CurrencyModel, SubscriptionMatchingRule } from '@bt/shared/types';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { PlusIcon, Trash2Icon } from 'lucide-vue-next';
import { computed } from 'vue';

const props = defineProps<{
  modelValue: SubscriptionMatchingRule[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: SubscriptionMatchingRule[]];
}>();

const accountsStore = useAccountsStore();
const { currencies } = usePrioritizedCurrencies();
const { formatCurrencyLabel } = useCurrencyName();

const getSelectedCurrency = ({ rule }: { rule: SubscriptionMatchingRule }) => {
  if (!rule.currencyCode) return null;
  return currencies.value.find((c) => c.code === rule.currencyCode) ?? null;
};

const FIELD_OPTIONS = [
  { label: 'Note', value: 'note' },
  { label: 'Amount', value: 'amount' },
  { label: 'Transaction Type', value: 'transactionType' },
  { label: 'Account', value: 'accountId' },
] as const;

const TRANSACTION_TYPE_OPTIONS = [
  { label: 'Income', value: TRANSACTION_TYPES.income },
  { label: 'Expense', value: TRANSACTION_TYPES.expense },
];

const accountOptions = computed(() =>
  accountsStore.enabledAccounts.map((a) => ({
    label: `${a.name} (${a.currencyCode})`,
    value: a.id,
  })),
);

const getOperatorForField = (field: string): string => {
  switch (field) {
    case 'note':
      return 'contains_any';
    case 'amount':
      return 'between';
    default:
      return 'equals';
  }
};

const getDefaultValueForField = (field: string): SubscriptionMatchingRule['value'] => {
  switch (field) {
    case 'note':
      return [''];
    case 'amount':
      return { min: 0, max: 0 };
    case 'transactionType':
      return TRANSACTION_TYPES.expense;
    case 'accountId':
      return 0;
    default:
      return '';
  }
};

const addRule = () => {
  const newRules = [
    ...props.modelValue,
    {
      field: 'note' as const,
      operator: 'contains_any' as const,
      value: [''] as string[],
    },
  ];
  emit('update:modelValue', newRules);
};

const removeRule = ({ index }: { index: number }) => {
  const newRules = props.modelValue.filter((_, i) => i !== index);
  emit('update:modelValue', newRules);
};

const updateRuleField = ({ index, field }: { index: number; field: string }) => {
  const newRules = [...props.modelValue];
  newRules[index] = {
    ...newRules[index]!,
    field: field as SubscriptionMatchingRule['field'],
    operator: getOperatorForField(field) as SubscriptionMatchingRule['operator'],
    value: getDefaultValueForField(field),
  };
  emit('update:modelValue', newRules);
};

const updateRuleValue = ({ index, value }: { index: number; value: SubscriptionMatchingRule['value'] }) => {
  const newRules = [...props.modelValue];
  newRules[index] = { ...newRules[index]!, value };
  emit('update:modelValue', newRules);
};

const updateRuleCurrencyCode = ({ index, currencyCode }: { index: number; currencyCode: string }) => {
  const newRules = [...props.modelValue];
  newRules[index] = { ...newRules[index]!, currencyCode: currencyCode || undefined };
  emit('update:modelValue', newRules);
};

// For note rules: manage the array of strings
const updateNoteKeyword = ({
  ruleIndex,
  keywordIndex,
  value,
}: {
  ruleIndex: number;
  keywordIndex: number;
  value: string;
}) => {
  const rule = props.modelValue[ruleIndex]!;
  const keywords = [...(rule.value as string[])];
  keywords[keywordIndex] = value;
  updateRuleValue({ index: ruleIndex, value: keywords });
};

const addNoteKeyword = ({ ruleIndex }: { ruleIndex: number }) => {
  const rule = props.modelValue[ruleIndex]!;
  const keywords = [...(rule.value as string[]), ''];
  updateRuleValue({ index: ruleIndex, value: keywords });
};

const removeNoteKeyword = ({ ruleIndex, keywordIndex }: { ruleIndex: number; keywordIndex: number }) => {
  const rule = props.modelValue[ruleIndex]!;
  const keywords = (rule.value as string[]).filter((_, i) => i !== keywordIndex);
  if (keywords.length === 0) keywords.push('');
  updateRuleValue({ index: ruleIndex, value: keywords });
};

const getAmountValue = ({ rule }: { rule: SubscriptionMatchingRule }): { min: number; max: number } => {
  return rule.value as { min: number; max: number };
};

const updateAmountMin = ({ index, rule, v }: { index: number; rule: SubscriptionMatchingRule; v: unknown }) => {
  const current = getAmountValue({ rule });
  updateRuleValue({ index, value: { ...current, min: Number(v ?? 0) } });
};

const updateAmountMax = ({ index, rule, v }: { index: number; rule: SubscriptionMatchingRule; v: unknown }) => {
  const current = getAmountValue({ rule });
  updateRuleValue({ index, value: { ...current, max: Number(v ?? 0) } });
};
</script>

<template>
  <div class="space-y-3">
    <div v-for="(rule, index) in modelValue" :key="index" class="border-border rounded-lg border p-3">
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground text-xs font-medium uppercase">
            {{ $t('planned.subscriptions.rules.ruleLabel', { number: index + 1 }) }}
          </span>
        </div>
        <Button type="button" variant="ghost-destructive" size="icon-sm" @click="removeRule({ index })">
          <Trash2Icon class="size-3.5" />
        </Button>
      </div>

      <!-- Field selector -->
      <SelectField
        :model-value="FIELD_OPTIONS.find((o) => o.value === rule.field) ?? null"
        :values="[...FIELD_OPTIONS]"
        label-key="label"
        value-key="value"
        :label="$t('planned.subscriptions.rules.fieldLabel')"
        :placeholder="$t('planned.subscriptions.rules.selectField')"
        @update:model-value="(v: any) => v && updateRuleField({ index, field: v.value })"
      />

      <!-- Note: keywords input -->
      <template v-if="rule.field === 'note'">
        <div class="mt-3 space-y-2">
          <p class="text-muted-foreground text-xs">{{ $t('planned.subscriptions.rules.noteDescription') }}</p>
          <div v-for="(keyword, ki) in (rule.value as string[])" :key="ki" class="flex items-center gap-2">
            <InputField
              :model-value="keyword"
              :placeholder="$t('planned.subscriptions.rules.keywordPlaceholder')"
              class="flex-1"
              @update:model-value="
                (v: any) => updateNoteKeyword({ ruleIndex: index, keywordIndex: ki, value: String(v ?? '') })
              "
            />
            <Button
              v-if="(rule.value as string[]).length > 1"
              variant="ghost"
              size="icon"
              class="size-8 shrink-0"
              type="button"
              @click="removeNoteKeyword({ ruleIndex: index, keywordIndex: ki })"
            >
              <Trash2Icon class="size-3.5" />
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" @click="addNoteKeyword({ ruleIndex: index })">
            <PlusIcon class="mr-1 size-3.5" />
            {{ $t('planned.subscriptions.rules.addKeyword') }}
          </Button>
        </div>
      </template>

      <!-- Amount: min/max + currency -->
      <template v-if="rule.field === 'amount'">
        <div class="mt-3 grid grid-cols-2 gap-3">
          <InputField
            :model-value="getAmountValue({ rule }).min"
            type="number"
            :label="$t('planned.subscriptions.rules.minAmount')"
            :placeholder="'0'"
            only-positive
            @update:model-value="(v: any) => updateAmountMin({ index, rule, v })"
          />
          <InputField
            :model-value="getAmountValue({ rule }).max"
            type="number"
            :label="$t('planned.subscriptions.rules.maxAmount')"
            :placeholder="'0'"
            only-positive
            @update:model-value="(v: any) => updateAmountMax({ index, rule, v })"
          />
        </div>
        <SelectField
          :model-value="getSelectedCurrency({ rule })"
          :values="currencies"
          value-key="code"
          :label="$t('planned.subscriptions.rules.currencyCode')"
          with-search
          :label-key="(item: CurrencyModel) => formatCurrencyLabel({ code: item.code, fallbackName: item.currency })"
          class="mt-3"
          @update:model-value="(v: any) => updateRuleCurrencyCode({ index, currencyCode: v?.code ?? '' })"
        />
      </template>

      <!-- Transaction Type: select -->
      <template v-if="rule.field === 'transactionType'">
        <div class="mt-3">
          <SelectField
            :model-value="TRANSACTION_TYPE_OPTIONS.find((o) => o.value === rule.value) ?? null"
            :values="TRANSACTION_TYPE_OPTIONS"
            label-key="label"
            value-key="value"
            :label="$t('planned.subscriptions.rules.transactionType')"
            @update:model-value="(v: any) => v && updateRuleValue({ index, value: v.value })"
          />
        </div>
      </template>

      <!-- Account: select -->
      <template v-if="rule.field === 'accountId'">
        <div class="mt-3">
          <SelectField
            :model-value="accountOptions.find((o) => o.value === rule.value) ?? null"
            :values="accountOptions"
            label-key="label"
            value-key="value"
            :label="$t('planned.subscriptions.rules.account')"
            with-search
            @update:model-value="(v: any) => v && updateRuleValue({ index, value: v.value })"
          />
        </div>
      </template>
    </div>

    <Button type="button" variant="outline" size="sm" @click="addRule">
      <PlusIcon class="mr-1.5 size-4" />
      {{ $t('planned.subscriptions.rules.addRule') }}
    </Button>
  </div>
</template>
