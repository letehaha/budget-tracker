<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { Label } from '@/components/lib/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/lib/ui/radio-group';
import { usePrioritizedCurrencies } from '@/composable/data-queries/prioritized-currencies';
import { useFormValidation } from '@/composable/form-validator';
import { useCurrencyName } from '@/composable/formatters';
import { helpers, required } from '@/js/helpers/validators';
import { cn } from '@/lib/utils';
import { useAccountsStore, useCategoriesStore, useCurrenciesStore } from '@/stores';
import {
  type CurrencyModel,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_TYPES,
  type SubscriptionMatchingRule,
  type SubscriptionModel,
} from '@bt/shared/types';
import { AlertCircleIcon, ChevronDownIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import MatchingRulesBuilder from './matching-rules-builder.vue';

const props = defineProps<{
  initialValues?: SubscriptionModel;
  formId?: string;
}>();

const emit = defineEmits<{
  submit: [payload: Omit<SubscriptionModel, 'id' | 'userId' | 'createdAt' | 'updatedAt'>];
  cancel: [];
}>();

const { t } = useI18n();
const accountsStore = useAccountsStore();
const categoriesStore = useCategoriesStore();
const currenciesStore = useCurrenciesStore();
const { formattedCategories } = storeToRefs(categoriesStore);
const { baseCurrency } = storeToRefs(currenciesStore);
const { currencies } = usePrioritizedCurrencies();
const { formatCurrencyLabel } = useCurrencyName();

const FREQUENCY_OPTIONS = [
  { label: t('planned.subscriptions.frequency.weekly'), value: SUBSCRIPTION_FREQUENCIES.weekly },
  { label: t('planned.subscriptions.frequency.biweekly'), value: SUBSCRIPTION_FREQUENCIES.biweekly },
  { label: t('planned.subscriptions.frequency.monthly'), value: SUBSCRIPTION_FREQUENCIES.monthly },
  { label: t('planned.subscriptions.frequency.quarterly'), value: SUBSCRIPTION_FREQUENCIES.quarterly },
  { label: t('planned.subscriptions.frequency.semiAnnual'), value: SUBSCRIPTION_FREQUENCIES.semiAnnual },
  { label: t('planned.subscriptions.frequency.annual'), value: SUBSCRIPTION_FREQUENCIES.annual },
];

const accountOptions = computed(() => [
  {
    label: t('planned.subscriptions.form.noAccount'),
    value: 0,
  },
  ...accountsStore.enabledAccounts.map((a) => ({
    label: `${a.name} (${a.currencyCode})`,
    value: a.id,
  })),
]);

interface FormState {
  name: string;
  type: SUBSCRIPTION_TYPES;
  expectedAmount: number | null;
  expectedCurrencyCode: string;
  frequency: SUBSCRIPTION_FREQUENCIES;
  startDate: Date | null;
  endDate: Date | null;
  accountId: number | null;
  categoryId: number | null;
  matchingRules: SubscriptionMatchingRule[];
  notes: string;
}

const getInitialState = (): FormState => {
  if (props.initialValues) {
    return {
      name: props.initialValues.name,
      type: props.initialValues.type,
      expectedAmount: props.initialValues.expectedAmount ?? null,
      expectedCurrencyCode: props.initialValues.expectedCurrencyCode ?? '',
      frequency: props.initialValues.frequency,
      startDate: new Date(props.initialValues.startDate),
      endDate: props.initialValues.endDate ? new Date(props.initialValues.endDate) : null,
      accountId: props.initialValues.accountId,
      categoryId: props.initialValues.categoryId,
      matchingRules: props.initialValues.matchingRules?.rules ?? [],
      notes: props.initialValues.notes ?? '',
    };
  }
  return {
    name: '',
    type: SUBSCRIPTION_TYPES.subscription,
    expectedAmount: null,
    expectedCurrencyCode: baseCurrency.value?.currencyCode ?? '',
    frequency: SUBSCRIPTION_FREQUENCIES.monthly,
    startDate: new Date(),
    endDate: null,
    accountId: null,
    categoryId: null,
    matchingRules: [],
    notes: '',
  };
};

const form = ref<FormState>(getInitialState());

// Find the selected category for the category select field
const selectedCategory = computed(() => {
  if (!form.value.categoryId) return null;
  const findCategory = (categories: typeof formattedCategories.value): (typeof formattedCategories.value)[0] | null => {
    for (const cat of categories) {
      if (cat.id === form.value.categoryId) return cat;
      if (cat.subCategories?.length) {
        const found = findCategory(cat.subCategories);
        if (found) return found;
      }
    }
    return null;
  };
  return findCategory(formattedCategories.value);
});

const selectedAccount = computed(() => {
  return accountOptions.value.find((a) => a.value === (form.value.accountId ?? 0)) ?? null;
});

const selectedCurrency = computed(() => {
  if (!form.value.expectedCurrencyCode) return null;
  return currencies.value.find((c) => c.code === form.value.expectedCurrencyCode) ?? null;
});

const selectedFrequency = computed(() => {
  return FREQUENCY_OPTIONS.find((f) => f.value === form.value.frequency) ?? null;
});

const formError = ref<string | null>(null);

const setError = ({ error }: { error: string }) => {
  formError.value = error;
};

const validationRules = computed(() => ({
  name: { required },
  expectedAmount: {
    requiredForSubscription: helpers.withMessage(
      t('planned.subscriptions.form.validationSubscriptionRequiresAmount'),
      (value: number | null, siblings: FormState) => {
        if (siblings.type !== SUBSCRIPTION_TYPES.subscription) return true;
        return value !== null && value > 0;
      },
    ),
    requiredWithCurrency: helpers.withMessage(
      t('planned.subscriptions.form.validationAmountCurrency'),
      (value: number | null, siblings: FormState) => {
        if (!siblings.expectedCurrencyCode) return true;
        return value !== null && value > 0;
      },
    ),
  },
  expectedCurrencyCode: {
    requiredWithAmount: helpers.withMessage(
      t('planned.subscriptions.form.validationAmountCurrency'),
      (value: string, siblings: FormState) => {
        if (siblings.expectedAmount === null || siblings.expectedAmount <= 0) return true;
        return !!value;
      },
    ),
  },
}));

const { isFormValid, getFieldErrorMessage, touchField } = useFormValidation(
  { form },
  computed(() => ({ form: validationRules.value })),
);

const isSubmitDisabled = computed(() => {
  return !form.value.name;
});

// Auto-expand extra options when editing and any extra field has a value
const hasExtraValues = computed(() => {
  const f = form.value;
  return !!(f.accountId || f.categoryId || f.notes || f.endDate);
});
const isExtraOpen = ref(!!props.initialValues && hasExtraValues.value);

defineExpose({ isSubmitDisabled, setError });

const isRulesDialogOpen = ref(false);
const draftRules = ref<SubscriptionMatchingRule[]>([]);

const openRulesDialog = () => {
  draftRules.value = JSON.parse(JSON.stringify(form.value.matchingRules));
  isRulesDialogOpen.value = true;
};

const saveRules = () => {
  form.value.matchingRules = draftRules.value;
  isRulesDialogOpen.value = false;
};

const handleSubmit = () => {
  if (!isFormValid()) return;

  formError.value = null;

  const payload: Omit<SubscriptionModel, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
    name: form.value.name,
    type: form.value.type,
    expectedAmount: form.value.expectedAmount ? Math.round(form.value.expectedAmount * 100) : null,
    expectedCurrencyCode: form.value.expectedCurrencyCode || null,
    frequency: form.value.frequency,
    startDate: form.value.startDate?.toISOString().split('T')[0] ?? new Date().toISOString().split('T')[0]!,
    endDate: form.value.endDate ? form.value.endDate.toISOString().split('T')[0]! : null,
    accountId: form.value.accountId || null,
    categoryId: form.value.categoryId || null,
    matchingRules: {
      rules: form.value.matchingRules.filter((r) => {
        // Filter out empty rules
        if (r.field === 'note') {
          const keywords = r.value as string[];
          return keywords.some((k) => k.trim().length > 0);
        }
        if (r.field === 'amount') {
          const val = r.value as { min: number; max: number };
          return val.min > 0 || val.max > 0;
        }
        return r.value !== 0 && r.value !== '';
      }),
    },
    isActive: props.initialValues?.isActive ?? true,
    notes: form.value.notes || null,
  };

  emit('submit', payload);
};
</script>

<template>
  <form :id="formId" class="grid gap-4" @submit.prevent="handleSubmit">
    <!-- Form Error -->
    <div v-if="formError" class="bg-destructive/10 text-destructive-text flex items-start gap-2 rounded-md p-3 text-sm">
      <AlertCircleIcon class="mt-0.5 size-4 shrink-0" />
      <span>{{ formError }}</span>
    </div>

    <!-- Name -->
    <InputField
      v-model="form.name"
      :label="$t('planned.subscriptions.form.nameLabel')"
      :placeholder="$t('planned.subscriptions.form.namePlaceholder')"
      :error-message="getFieldErrorMessage('form.name')"
      @blur="touchField('form.name')"
    />

    <!-- Type -->
    <div>
      <Label class="mb-2 block text-sm font-medium">{{ $t('planned.subscriptions.form.typeLabel') }}</Label>
      <RadioGroup v-model="form.type" class="grid grid-cols-2 gap-3">
        <Label
          :class="
            cn(
              'border-input hover:bg-accent hover:text-accent-foreground flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
              form.type === SUBSCRIPTION_TYPES.subscription && 'border-primary bg-primary/5',
            )
          "
        >
          <div class="flex items-center gap-2">
            <RadioGroupItem :value="SUBSCRIPTION_TYPES.subscription" />
            <span class="font-medium">{{ $t('planned.subscriptions.typeSubscription') }}</span>
          </div>
          <span class="text-muted-foreground pl-6 text-xs">{{
            $t('planned.subscriptions.form.typeSubscriptionDesc')
          }}</span>
        </Label>
        <Label
          :class="
            cn(
              'border-input hover:bg-accent hover:text-accent-foreground flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
              form.type === SUBSCRIPTION_TYPES.bill && 'border-primary bg-primary/5',
            )
          "
        >
          <div class="flex items-center gap-2">
            <RadioGroupItem :value="SUBSCRIPTION_TYPES.bill" />
            <span class="font-medium">{{ $t('planned.subscriptions.typeBill') }}</span>
          </div>
          <span class="text-muted-foreground pl-6 text-xs">{{ $t('planned.subscriptions.form.typeBillDesc') }}</span>
        </Label>
      </RadioGroup>
    </div>

    <!-- Amount + Currency -->
    <div class="grid grid-cols-2 gap-3">
      <InputField
        v-model.number="form.expectedAmount"
        type="number"
        :label="$t('planned.subscriptions.form.amountLabel')"
        :placeholder="$t('planned.subscriptions.form.amountPlaceholder')"
        :error-message="getFieldErrorMessage('form.expectedAmount')"
        only-positive
        @blur="touchField('form.expectedAmount')"
      />
      <SelectField
        :model-value="selectedCurrency"
        :values="currencies"
        value-key="code"
        :label="$t('planned.subscriptions.form.currencyLabel')"
        :error-message="getFieldErrorMessage('form.expectedCurrencyCode')"
        with-search
        :label-key="(item: CurrencyModel) => formatCurrencyLabel({ code: item.code, fallbackName: item.currency })"
        @update:model-value="(v: any) => (form.expectedCurrencyCode = v?.code ?? '')"
        @blur="touchField('form.expectedCurrencyCode')"
      />
    </div>

    <!-- Frequency -->
    <SelectField
      :model-value="selectedFrequency"
      :values="FREQUENCY_OPTIONS"
      label-key="label"
      value-key="value"
      :label="$t('planned.subscriptions.form.frequencyLabel')"
      @update:model-value="(v: any) => v && (form.frequency = v.value)"
    />

    <!-- Matching Rules -->
    <div>
      <Label class="mb-2 block text-sm font-medium">{{ $t('planned.subscriptions.form.matchingRulesLabel') }}</Label>
      <p class="text-muted-foreground mb-2 text-xs">{{ $t('planned.subscriptions.form.matchingRulesDescription') }}</p>
      <div v-if="form.matchingRules.length" class="border-border mb-2 rounded-lg border p-3">
        <p class="text-sm">
          {{ $t('planned.subscriptions.form.rulesCount', { count: form.matchingRules.length }) }}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" @click="openRulesDialog">
        {{
          form.matchingRules.length
            ? $t('planned.subscriptions.form.editRules')
            : $t('planned.subscriptions.form.addRules')
        }}
      </Button>
    </div>

    <!-- Extra Options -->
    <Collapsible v-model:open="isExtraOpen">
      <CollapsibleTrigger as-child>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 text-sm transition-colors"
        >
          <ChevronDownIcon :class="cn('size-4 transition-transform', isExtraOpen && 'rotate-180')" />
          {{ $t('planned.subscriptions.form.extraOptions') }}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div class="grid gap-4 pt-3">
          <!-- Dates -->
          <div class="grid grid-cols-2 gap-3">
            <DateField
              v-model="form.startDate"
              :calendar-options="{ maxDate: form.endDate ?? undefined }"
              :label="$t('planned.subscriptions.form.startDateLabel')"
            />
            <DateField
              v-model="form.endDate"
              :calendar-options="{ minDate: form.startDate ?? undefined }"
              :label="$t('planned.subscriptions.form.endDateLabel')"
            />
          </div>

          <!-- Account -->
          <SelectField
            :model-value="selectedAccount"
            :values="accountOptions"
            label-key="label"
            value-key="value"
            :label="$t('planned.subscriptions.form.accountLabel')"
            with-search
            @update:model-value="(v: any) => (form.accountId = v?.value === 0 ? null : (v?.value ?? null))"
          />

          <!-- Category -->
          <CategorySelectField
            :model-value="selectedCategory"
            :values="formattedCategories"
            :label="$t('planned.subscriptions.form.categoryLabel')"
            :placeholder="$t('planned.subscriptions.form.categoryPlaceholder')"
            @update:model-value="(v: any) => (form.categoryId = v?.id ?? null)"
          />

          <!-- Notes -->
          <TextareaField
            v-model="form.notes"
            :label="$t('planned.subscriptions.form.notesLabel')"
            :placeholder="$t('planned.subscriptions.form.notesPlaceholder')"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>

    <!-- Matching Rules Dialog -->
    <ResponsiveDialog v-model:open="isRulesDialogOpen" dialog-content-class="max-w-lg">
      <template #title>{{ $t('planned.subscriptions.form.matchingRulesLabel') }}</template>
      <template #description>{{ $t('planned.subscriptions.form.matchingRulesDescription') }}</template>

      <div class="py-1">
        <MatchingRulesBuilder v-model="draftRules" />
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="isRulesDialogOpen = false">
            {{ $t('planned.subscriptions.cancel') }}
          </Button>
          <Button type="button" @click="saveRules">
            {{ $t('planned.subscriptions.form.saveRules') }}
          </Button>
        </div>
      </template>
    </ResponsiveDialog>
  </form>
</template>
