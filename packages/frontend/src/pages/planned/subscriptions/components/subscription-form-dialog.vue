<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { Label } from '@/components/lib/ui/label';
import { Switch } from '@/components/lib/ui/switch';
import { usePrioritizedCurrencies } from '@/composable/data-queries/prioritized-currencies';
import { useFormValidation } from '@/composable/form-validator';
import { useCurrencyName, useFormatCurrency } from '@/composable/formatters';
import { helpers, required } from '@/js/helpers/validators';
import { cn } from '@/lib/utils';
import { useAccountsStore, useCategoriesStore, useCurrenciesStore } from '@/stores';
import {
  type CurrencyModel,
  MAX_REMIND_BEFORE_PRESETS,
  REMIND_BEFORE_DAYS,
  REMIND_BEFORE_PRESETS,
  type RemindBeforePreset,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_TYPES,
  type SubscriptionMatchingRule,
  type SubscriptionModel,
  type RecordId,
} from '@bt/shared/types';
import { ChevronDownIcon, CreditCardIcon, ReceiptIcon, RepeatIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import LogoSquareField from '@/components/common/logo-square-field.vue';

import MatchingRulesBuilder from './matching-rules-builder.vue';

const props = defineProps<{
  initialValues?: Partial<SubscriptionModel>;
  formId?: string;
}>();

// Snapshot of the logo at open time. The submit payload includes `logoDomain`
// only when it differs from this, so an untouched subscription keeps its
// auto-resolved logo (the key is omitted, leaving the resolver in charge) while
// a user pick or clear is sent as a manual override.
const initialLogoDomain = props.initialValues?.logoDomain ?? null;

const emit = defineEmits<{
  submit: [
    payload: Partial<Omit<SubscriptionModel, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> & {
      name: string;
      type: SUBSCRIPTION_TYPES;
      frequency: SUBSCRIPTION_FREQUENCIES;
      startDate: string;
      isActive: boolean;
      dueDate?: string | null;
      maxOccurrences?: number | null;
      remindBefore?: RemindBeforePreset[];
      notifyEmail?: boolean;
    },
  ];
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
const { formatAmountByCurrencyCode } = useFormatCurrency();

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
    value: null,
  },
  ...accountsStore.activeAccounts.map((a) => ({
    label: `${a.name} (${a.currencyCode})`,
    value: a.id,
  })),
]);

// Reminder presets rendered as togglable pills, ordered nearest-to-due first.
const REMIND_BEFORE_OPTIONS = (Object.values(REMIND_BEFORE_PRESETS) as RemindBeforePreset[]).sort(
  (a, b) => REMIND_BEFORE_DAYS[a] - REMIND_BEFORE_DAYS[b],
);

const toggleRemindBefore = ({ preset }: { preset: RemindBeforePreset }) => {
  const selected = form.value.remindBefore;
  if (selected.includes(preset)) {
    form.value.remindBefore = selected.filter((p) => p !== preset);
  } else if (selected.length < MAX_REMIND_BEFORE_PRESETS) {
    form.value.remindBefore = [...selected, preset];
  }
};

interface FormState {
  name: string;
  type: SUBSCRIPTION_TYPES;
  expectedAmount: number | null;
  expectedCurrencyCode: string;
  frequency: SUBSCRIPTION_FREQUENCIES;
  dueDate: Date | null;
  maxOccurrences: number | null;
  remindBefore: RemindBeforePreset[];
  notifyEmail: boolean;
  startDate: Date | null;
  endDate: Date | null;
  accountId: string | null;
  categoryId: string | null;
  matchingRules: SubscriptionMatchingRule[];
  notes: string;
  /** Manually chosen logo domain. null = let the backend auto-resolve from the name. */
  logoDomain: string | null;
}

const getInitialState = (): FormState => {
  if (props.initialValues) {
    return {
      name: props.initialValues.name ?? '',
      type: props.initialValues.type ?? SUBSCRIPTION_TYPES.subscription,
      expectedAmount: props.initialValues.expectedAmount ?? null,
      expectedCurrencyCode: props.initialValues.expectedCurrencyCode ?? '',
      frequency: props.initialValues.frequency ?? SUBSCRIPTION_FREQUENCIES.monthly,
      dueDate: props.initialValues.dueDate ? new Date(props.initialValues.dueDate) : null,
      maxOccurrences: props.initialValues.maxOccurrences ?? null,
      remindBefore: props.initialValues.remindBefore ?? [],
      notifyEmail: props.initialValues.notifyEmail ?? false,
      startDate: props.initialValues.startDate ? new Date(props.initialValues.startDate) : new Date(),
      endDate: props.initialValues.endDate ? new Date(props.initialValues.endDate) : null,
      accountId: props.initialValues.accountId ?? null,
      categoryId: props.initialValues.categoryId ?? null,
      matchingRules: props.initialValues.matchingRules?.rules ?? [],
      notes: props.initialValues.notes ?? '',
      logoDomain: props.initialValues.logoDomain ?? null,
    };
  }
  return {
    name: '',
    type: SUBSCRIPTION_TYPES.subscription,
    expectedAmount: null,
    expectedCurrencyCode: baseCurrency.value?.currencyCode ?? '',
    frequency: SUBSCRIPTION_FREQUENCIES.monthly,
    dueDate: null,
    maxOccurrences: null,
    remindBefore: [],
    notifyEmail: false,
    startDate: new Date(),
    endDate: null,
    accountId: null,
    categoryId: null,
    matchingRules: [],
    notes: '',
    logoDomain: null,
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
  return accountOptions.value.find((a) => a.value === form.value.accountId) ?? null;
});

const selectedCurrency = computed(() => {
  if (!form.value.expectedCurrencyCode) return null;
  return currencies.value.find((c) => c.code === form.value.expectedCurrencyCode) ?? null;
});

const selectedFrequency = computed(() => {
  return FREQUENCY_OPTIONS.find((f) => f.value === form.value.frequency) ?? null;
});

const isInstallment = computed(() => form.value.type === SUBSCRIPTION_TYPES.installment);

const typeOptions = computed(() => [
  {
    value: SUBSCRIPTION_TYPES.subscription,
    label: t('planned.subscriptions.typeSubscription'),
    desc: t('planned.subscriptions.form.typeSubscriptionDesc'),
    icon: RepeatIcon,
  },
  {
    value: SUBSCRIPTION_TYPES.bill,
    label: t('planned.subscriptions.typeBill'),
    desc: t('planned.subscriptions.form.typeBillDesc'),
    icon: ReceiptIcon,
  },
  {
    value: SUBSCRIPTION_TYPES.installment,
    label: t('planned.subscriptions.typeInstallment'),
    desc: t('planned.subscriptions.form.typeInstallmentDesc'),
    icon: CreditCardIcon,
  },
]);

const selectedTypeOption = computed(() => typeOptions.value.find((opt) => opt.value === form.value.type) ?? null);

// Projected total an installment commits to (amount x number of payments), shown
// as a hint once both are known. Null when amount or count is missing.
const installmentTotalLabel = computed(() => {
  if (!isInstallment.value) return null;
  const { expectedAmount, maxOccurrences, expectedCurrencyCode } = form.value;
  if (!expectedAmount || !maxOccurrences || !expectedCurrencyCode) return null;
  return formatAmountByCurrencyCode(expectedAmount * maxOccurrences, expectedCurrencyCode);
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
  },
  // Only require a currency once an amount is actually entered. The reverse coupling
  // (amount required when a currency is set) is intentionally absent: the base currency
  // is auto-prefilled, so an amount-optional bill/installment must not be forced to
  // carry an amount. The submit handler drops the prefilled currency when no amount is set.
  expectedCurrencyCode: {
    requiredWithAmount: helpers.withMessage(
      t('planned.subscriptions.form.validationAmountCurrency'),
      (value: string, siblings: FormState) => {
        if (siblings.expectedAmount === null || siblings.expectedAmount <= 0) return true;
        return !!value;
      },
    ),
  },
  dueDate: {
    requiredForInstallment: helpers.withMessage(
      t('planned.subscriptions.form.validationInstallmentRequiresSchedule'),
      (value: Date | null, siblings: FormState) => {
        if (siblings.type !== SUBSCRIPTION_TYPES.installment) return true;
        return value != null;
      },
    ),
  },
  maxOccurrences: {
    requiredForInstallment: helpers.withMessage(
      t('planned.subscriptions.form.validationInstallmentRequiresCount'),
      (value: number | null, siblings: FormState) => {
        if (siblings.type !== SUBSCRIPTION_TYPES.installment) return true;
        return value != null && value > 0;
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

// Auto-expand the schedule + advanced sections when editing an existing entry
// that already has values inside them. Installments require a schedule, so the
// section stays open whenever installment is the chosen type.
const hasExtraValues = computed(() => {
  const f = form.value;
  return !!(f.accountId || f.categoryId || f.notes || f.endDate || f.matchingRules.length);
});
const isExtraOpen = ref(!!props.initialValues && hasExtraValues.value);
const isScheduleOpen = ref(isInstallment.value || !!form.value.dueDate);

// Keep the schedule section in sync with installment selection – the schedule
// is mandatory for installments so we force it open whenever that type is picked.
watch(isInstallment, (installment) => {
  if (installment) isScheduleOpen.value = true;
});

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

  const payload = {
    name: form.value.name,
    type: form.value.type,
    expectedAmount: form.value.expectedAmount || null,
    // Currency is meaningless without an amount and the API rejects one without the
    // other, so drop the (auto-prefilled) currency when no amount is entered.
    expectedCurrencyCode: form.value.expectedAmount ? form.value.expectedCurrencyCode || null : null,
    frequency: form.value.frequency,
    dueDate: form.value.dueDate ? form.value.dueDate.toISOString().split('T')[0]! : null,
    maxOccurrences: form.value.maxOccurrences ?? null,
    remindBefore: form.value.remindBefore,
    notifyEmail: form.value.notifyEmail,
    startDate: form.value.startDate?.toISOString().split('T')[0] ?? new Date().toISOString().split('T')[0]!,
    endDate: form.value.endDate ? form.value.endDate.toISOString().split('T')[0]! : null,
    accountId: (form.value.accountId || null) as RecordId | null,
    categoryId: (form.value.categoryId || null) as RecordId | null,
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
    ...(form.value.logoDomain !== initialLogoDomain ? { logoDomain: form.value.logoDomain } : {}),
  };

  emit('submit', payload);
};
</script>

<template>
  <form :id="formId" class="grid gap-4" @submit.prevent="handleSubmit">
    <!-- Form Error -->
    <Callout v-if="formError" variant="destructive">
      <span>{{ formError }}</span>
    </Callout>

    <!-- Name + Logo (square trigger) in a single row. Label sits above the input
         column only, logo on the right is unlabelled so swapping its order keeps
         the "Name" caption hugging the field it actually describes. items-start
         so a validation error growing below the input doesn't drag the logo down. -->
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <InputField
          v-model="form.name"
          :label="$t('planned.subscriptions.form.nameLabel')"
          :placeholder="$t('planned.subscriptions.form.namePlaceholder')"
          :error-message="getFieldErrorMessage('form.name')"
          @blur="touchField('form.name')"
        />
      </div>
      <LogoSquareField
        v-model="form.logoDomain"
        :name-for-search="form.name"
        size-class="size-10 rounded-lg"
        class="mt-[21px]"
      />
    </div>

    <!-- Type: SelectField with rich items (icon + title + description). Trigger
         stays compact – the selected type's name plus a one-line caption below. -->
    <div>
      <SelectField
        :model-value="selectedTypeOption"
        :values="typeOptions"
        label-key="label"
        value-key="value"
        :label="$t('planned.subscriptions.form.typeLabel')"
        @update:model-value="(v: any) => v && (form.type = v.value)"
      >
        <template #item="{ item }">
          <div class="flex items-start gap-2.5 py-0.5">
            <span
              class="border-input bg-muted/40 text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
            >
              <component :is="item.icon" class="h-4 w-4" />
            </span>
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="text-sm leading-tight font-medium">{{ item.label }}</span>
              <span class="text-muted-foreground text-xs leading-snug">{{ item.desc }}</span>
            </div>
          </div>
        </template>
      </SelectField>
      <p v-if="selectedTypeOption" class="text-muted-foreground mt-1.5 text-xs">{{ selectedTypeOption.desc }}</p>
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

    <!-- Payment schedule: opt-in. Setting a due date generates payable periods
         (mark-as-paid + reminders). Left empty, the subscription is detection-only.
         Installments require a schedule, so the toggle is hidden + forced open. -->
    <Collapsible v-model:open="isScheduleOpen">
      <CollapsibleTrigger v-if="!isInstallment" as-child>
        <button
          type="button"
          class="border-input bg-background hover:bg-accent/40 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
        >
          <span class="flex min-w-0 flex-col">
            <span class="text-sm font-medium">{{ $t('planned.subscriptions.form.scheduleSectionLabel') }}</span>
            <span class="text-muted-foreground text-xs">{{
              $t('planned.subscriptions.form.scheduleSectionHint')
            }}</span>
          </span>
          <ChevronDownIcon
            :class="cn('text-muted-foreground size-4 shrink-0 transition-transform', isScheduleOpen && 'rotate-180')"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div :class="cn('border-border bg-muted/20 grid gap-3 rounded-lg border p-3', !isInstallment && 'mt-2')">
          <DateField
            :model-value="form.dueDate ?? undefined"
            :label="$t('planned.subscriptions.form.dueDateLabel')"
            @update:model-value="(v: Date | null) => (form.dueDate = v)"
          />
          <p class="text-muted-foreground -mt-2 text-xs">
            {{
              isInstallment
                ? $t('planned.subscriptions.form.installmentScheduleHint')
                : $t('planned.subscriptions.form.dueDateDescription')
            }}
          </p>
          <p v-if="getFieldErrorMessage('form.dueDate')" class="text-destructive-text -mt-2 text-xs">
            {{ getFieldErrorMessage('form.dueDate') }}
          </p>

          <!-- Payment count caps generation: required for installments (finite plan
               length), optional for subscriptions/bills where null repeats forever.
               Shown for installments even before a date is set so both required
               fields are visible together. -->
          <InputField
            v-if="form.dueDate || isInstallment"
            :model-value="form.maxOccurrences ?? undefined"
            type="number"
            :label="$t('planned.subscriptions.form.maxOccurrencesLabel')"
            :placeholder="$t('planned.subscriptions.form.maxOccurrencesPlaceholder')"
            :error-message="getFieldErrorMessage('form.maxOccurrences')"
            only-positive
            @update:model-value="(v: string | number | null) => (form.maxOccurrences = v ? Number(v) : null)"
            @blur="touchField('form.maxOccurrences')"
          />
          <p v-if="installmentTotalLabel" class="text-muted-foreground -mt-1 text-xs">
            {{ $t('planned.subscriptions.form.installmentTotalCommitment', { total: installmentTotalLabel }) }}
          </p>

          <!-- Advance reminders only apply to scheduled periods, so they share the due-date gate. -->
          <div v-if="form.dueDate" class="grid gap-2">
            <Label class="text-sm font-medium">{{ $t('planned.subscriptions.form.remindBeforeLabel') }}</Label>
            <div class="flex flex-wrap gap-2">
              <Label
                v-for="preset in REMIND_BEFORE_OPTIONS"
                :key="preset"
                :class="
                  cn(
                    'border-input flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    form.remindBefore.includes(preset)
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-accent hover:text-accent-foreground',
                    !form.remindBefore.includes(preset) &&
                      form.remindBefore.length >= MAX_REMIND_BEFORE_PRESETS &&
                      'pointer-events-none cursor-not-allowed opacity-50',
                  )
                "
              >
                <input
                  type="checkbox"
                  class="sr-only"
                  :checked="form.remindBefore.includes(preset)"
                  :disabled="
                    !form.remindBefore.includes(preset) && form.remindBefore.length >= MAX_REMIND_BEFORE_PRESETS
                  "
                  @change="toggleRemindBefore({ preset })"
                />
                {{ $t(`planned.subscriptions.form.remindPresets.${preset}`) }}
              </Label>
            </div>
            <p class="text-muted-foreground text-xs">
              {{ $t('planned.subscriptions.form.remindBeforeHelper') }}
            </p>

            <label class="mt-1 flex cursor-pointer items-center justify-between gap-3">
              <span class="text-sm">{{ $t('planned.subscriptions.form.notifyEmailLabel') }}</span>
              <Switch v-model="form.notifyEmail" />
            </label>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>

    <!-- Advanced section: account, category, dates, notes, matching rules. Auto-opens
         when editing an entry that already has any of these set. -->
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

          <!-- Dates -->
          <div class="grid grid-cols-2 gap-3">
            <DateField
              :model-value="form.startDate ?? undefined"
              :calendar-options="{ maxDate: form.endDate ?? undefined }"
              :label="$t('planned.subscriptions.form.startDateLabel')"
              @update:model-value="(v: Date | null) => (form.startDate = v)"
            />
            <DateField
              :model-value="form.endDate ?? undefined"
              :label="$t('planned.subscriptions.form.endDateLabel')"
              @update:model-value="(v: Date | null) => (form.endDate = v)"
            />
          </div>

          <!-- Matching Rules -->
          <div>
            <Label class="mb-1.5 block text-sm font-medium">
              {{ $t('planned.subscriptions.form.matchingRulesLabel') }}
            </Label>
            <p class="text-muted-foreground mb-2 text-xs">
              {{ $t('planned.subscriptions.form.matchingRulesDescription') }}
            </p>
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
