<script setup lang="ts">
import CategorySelectField from '@/components/fields/category-select-field.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import Label from '@/components/lib/ui/label/Label.vue';
import { getAccountDisplayLabel, isAccountArchived } from '@/common/utils/account-display';
import type { FormattedCategory } from '@/common/types';
import { usePrioritizedCurrencies } from '@/composable/data-queries/prioritized-currencies';
import { useAccountsStore, useCategoriesStore } from '@/stores';
import {
  type AccountModel,
  MAX_REMIND_BEFORE_PRESETS,
  PREFERRED_TIME_SLOTS,
  REMIND_BEFORE_PRESETS,
  type RemindBeforePreset,
  SUBSCRIPTION_FREQUENCIES,
} from '@bt/shared/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { ChevronDownIcon, MailIcon } from '@lucide/vue';
import { format } from 'date-fns';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import type { CreateReminderPayload, PaymentReminderDetail } from '@/api/payment-reminders';

type SelectOption = { value: string; label: string };

const { t } = useI18n();

const props = defineProps<{
  initialValues?: PaymentReminderDetail;
  formId?: string;
  isSubscriptionLinked?: boolean;
}>();

const emit = defineEmits<{
  submit: [payload: CreateReminderPayload];
  cancel: [];
}>();

interface FormState {
  name: string;
  dueDate: Date | null;
  expectedAmount: string;
  currencyCode: string;
  frequency: string;
  remindBefore: RemindBeforePreset[];
  notifyEmail: boolean;
  preferredTime: number;
  timezone: string;
  categoryId: string | null;
  accountId: string | null;
  /** Installment cap; empty string = repeats indefinitely. */
  maxOccurrences: string;
  notes: string;
}

function getInitialState(): FormState {
  const iv = props.initialValues;
  return {
    name: iv?.name ?? '',
    dueDate: iv?.dueDate ? new Date(iv.dueDate) : null,
    expectedAmount: iv?.expectedAmount != null ? String(iv.expectedAmount) : '',
    currencyCode: iv?.currencyCode ?? '',
    frequency: iv?.frequency ?? ONE_TIME_VALUE,
    remindBefore: iv?.remindBefore ?? [],
    notifyEmail: iv?.notifyEmail ?? false,
    preferredTime: iv?.preferredTime ?? 8,
    timezone: iv?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    categoryId: iv?.categoryId ?? null,
    accountId: iv?.accountId ?? null,
    maxOccurrences: iv?.maxOccurrences != null ? String(iv.maxOccurrences) : '',
    notes: iv?.notes ?? '',
  };
}

const form = ref<FormState>(getInitialState());

watch(
  () => props.initialValues,
  () => {
    form.value = getInitialState();
  },
);

const error = ref('');

const isCreateMode = computed(() => !props.initialValues);

const today = computed(() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
});

// --- Select field options ---

const ONE_TIME_VALUE = 'one_time';

const frequencyOptions = computed<SelectOption[]>(() => [
  { value: ONE_TIME_VALUE, label: t('planned.reminders.frequencies.oneTime') },
  { value: SUBSCRIPTION_FREQUENCIES.weekly, label: t('planned.reminders.frequencies.weekly') },
  { value: SUBSCRIPTION_FREQUENCIES.biweekly, label: t('planned.reminders.frequencies.biweekly') },
  { value: SUBSCRIPTION_FREQUENCIES.monthly, label: t('planned.reminders.frequencies.monthly') },
  { value: SUBSCRIPTION_FREQUENCIES.quarterly, label: t('planned.reminders.frequencies.quarterly') },
  { value: SUBSCRIPTION_FREQUENCIES.semiAnnual, label: t('planned.reminders.frequencies.semiAnnual') },
  { value: SUBSCRIPTION_FREQUENCIES.annual, label: t('planned.reminders.frequencies.annual') },
]);

const selectedFrequency = computed(() => frequencyOptions.value.find((o) => o.value === form.value.frequency) ?? null);

const timeSlotOptions: SelectOption[] = PREFERRED_TIME_SLOTS.map((h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}));

const selectedTimeSlot = computed(
  () => timeSlotOptions.find((o) => o.value === String(form.value.preferredTime)) ?? null,
);

const { currencies } = usePrioritizedCurrencies();

const currencyOptions = computed(() =>
  currencies.value.map((c) => ({ value: c.code, label: `${c.code} (${c.currency})` })),
);

const selectedCurrency = computed(() => currencyOptions.value.find((o) => o.value === form.value.currencyCode) ?? null);

const isRecurring = computed(() => form.value.frequency !== ONE_TIME_VALUE);

// --- Account (required; drives currency) ---

const { txTargetableAccountsActiveFirst } = storeToRefs(useAccountsStore());

const selectedAccount = computed(
  () => txTargetableAccountsActiveFirst.value.find((a) => a.id === form.value.accountId) ?? null,
);

function updateAccount(account: AccountModel | null) {
  form.value.accountId = account?.id ?? null;
  // Currency follows the picked account, so the standalone currency picker is
  // hidden while an account is selected.
  if (account?.currencyCode) {
    form.value.currencyCode = account.currencyCode;
  }
}

// --- Category (optional) ---

const { formattedCategories } = storeToRefs(useCategoriesStore());

const selectedCategory = computed(() => formattedCategories.value.find((c) => c.id === form.value.categoryId) ?? null);

function updateCategory(category: FormattedCategory | null) {
  form.value.categoryId = category?.id ?? null;
}

// --- Remind before ---

const remindBeforeOptions = computed<{ value: RemindBeforePreset; label: string }[]>(() => [
  { value: REMIND_BEFORE_PRESETS.onDueDate, label: t('planned.reminders.remindBefore.onDueDate') },
  { value: REMIND_BEFORE_PRESETS.oneDay, label: t('planned.reminders.remindBefore.oneDay') },
  { value: REMIND_BEFORE_PRESETS.twoDays, label: t('planned.reminders.remindBefore.twoDays') },
  { value: REMIND_BEFORE_PRESETS.threeDays, label: t('planned.reminders.remindBefore.threeDays') },
  { value: REMIND_BEFORE_PRESETS.fiveDays, label: t('planned.reminders.remindBefore.fiveDays') },
  { value: REMIND_BEFORE_PRESETS.oneWeek, label: t('planned.reminders.remindBefore.oneWeek') },
  { value: REMIND_BEFORE_PRESETS.twoWeeks, label: t('planned.reminders.remindBefore.twoWeeks') },
  { value: REMIND_BEFORE_PRESETS.oneMonth, label: t('planned.reminders.remindBefore.oneMonth') },
]);

function toggleRemindBefore(preset: RemindBeforePreset) {
  const idx = form.value.remindBefore.indexOf(preset);
  if (idx >= 0) {
    form.value.remindBefore.splice(idx, 1);
  } else if (form.value.remindBefore.length < MAX_REMIND_BEFORE_PRESETS) {
    form.value.remindBefore.push(preset);
  }
}

// --- Submit ---

const isSubmitDisabled = computed(
  () => !form.value.name || !form.value.dueDate || (isCreateMode.value && !form.value.accountId),
);

function setError({ error: msg }: { error: string }) {
  error.value = msg;
}

function handleSubmit() {
  if (isSubmitDisabled.value) return;
  error.value = '';

  if (isCreateMode.value && form.value.dueDate && form.value.dueDate < today.value) {
    error.value = t('planned.reminders.form.dueDatePastError');
    return;
  }

  const isRecurringFrequency = form.value.frequency !== ONE_TIME_VALUE;

  const payload: CreateReminderPayload = {
    name: form.value.name,
    dueDate: format(form.value.dueDate!, 'yyyy-MM-dd'),
    frequency: isRecurringFrequency ? (form.value.frequency as SUBSCRIPTION_FREQUENCIES) : null,
    remindBefore: form.value.remindBefore.length ? form.value.remindBefore : undefined,
    notifyEmail: form.value.notifyEmail,
    preferredTime: form.value.preferredTime,
    timezone: form.value.timezone,
    categoryId: form.value.categoryId,
    accountId: form.value.accountId,
    // Only recurring reminders support an installment cap; an empty field means
    // "repeats indefinitely". One-time reminders never carry one.
    maxOccurrences: isRecurringFrequency && form.value.maxOccurrences ? Number(form.value.maxOccurrences) : null,
    notes: form.value.notes || undefined,
  };

  // Currency follows the selected account. Send the expected amount only when one
  // is entered (empty = variable amount), pairing it with the account's currency.
  if (form.value.expectedAmount && form.value.currencyCode) {
    payload.expectedAmount = Number(form.value.expectedAmount);
    payload.currencyCode = form.value.currencyCode;
  }

  emit('submit', payload);
}

const isExtraOptionsOpen = ref(false);

defineExpose({ isSubmitDisabled, setError });
</script>

<template>
  <form :id="formId" class="grid gap-4" @submit.prevent="handleSubmit">
    <InputField
      v-model="form.name"
      :label="$t('planned.reminders.form.nameLabel')"
      :placeholder="$t('planned.reminders.form.namePlaceholder')"
      :disabled="isSubscriptionLinked"
    />

    <DateField
      :model-value="form.dueDate ?? undefined"
      :label="$t('planned.reminders.form.dueDateLabel')"
      :calendar-options="isCreateMode ? { minDate: today } : undefined"
      @update:model-value="(v: Date) => (form.dueDate = v)"
    />

    <SelectField
      :model-value="selectedAccount"
      :values="txTargetableAccountsActiveFirst"
      value-key="id"
      :label-key="getAccountDisplayLabel"
      with-search
      :label="$t('planned.reminders.form.accountLabel')"
      :placeholder="$t('planned.reminders.form.accountPlaceholder')"
      @update:model-value="updateAccount"
    >
      <template #item="{ item, label }">
        <span :class="{ 'text-muted-foreground italic': isAccountArchived(item) }">{{ label }}</span>
      </template>
    </SelectField>

    <CategorySelectField
      :model-value="selectedCategory"
      :values="formattedCategories"
      label-key="name"
      :label="$t('planned.reminders.form.categoryLabel')"
      :placeholder="$t('planned.reminders.form.categoryPlaceholder')"
      @update:model-value="updateCategory"
    />

    <SelectField
      :model-value="selectedFrequency"
      :values="frequencyOptions"
      :label="$t('planned.reminders.form.frequencyLabel')"
      :disabled="isSubscriptionLinked"
      @update:model-value="(v: SelectOption | null) => (form.frequency = v?.value ?? ONE_TIME_VALUE)"
    />

    <div v-if="isRecurring">
      <InputField
        v-model="form.maxOccurrences"
        type="number"
        min="1"
        step="1"
        only-positive
        :label="$t('planned.reminders.form.endsAfterLabel')"
        :placeholder="$t('planned.reminders.form.endsAfterPlaceholder')"
      />
      <p class="text-muted-foreground mt-1 text-xs">{{ $t('planned.reminders.form.endsAfterHint') }}</p>
    </div>

    <div>
      <Label class="mb-2 block text-sm font-medium">
        {{ $t('planned.reminders.form.remindBeforeLabel', { max: MAX_REMIND_BEFORE_PRESETS }) }}
      </Label>
      <div class="flex flex-wrap gap-2">
        <UiButton
          v-for="opt in remindBeforeOptions"
          :key="opt.value"
          type="button"
          size="sm"
          :variant="form.remindBefore.includes(opt.value) ? 'secondary' : 'outline'"
          :disabled="!form.remindBefore.includes(opt.value) && form.remindBefore.length >= MAX_REMIND_BEFORE_PRESETS"
          @click="toggleRemindBefore(opt.value)"
        >
          {{ opt.label }}
        </UiButton>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <Checkbox
        :id="`${formId}-email`"
        :model-value="form.notifyEmail"
        @update:model-value="(val) => (form.notifyEmail = !!val)"
      />
      <Label :for="`${formId}-email`" class="flex items-center gap-1.5 text-base">
        <MailIcon class="size-4" />
        {{ $t('planned.reminders.form.emailNotifications') }}
      </Label>
    </div>

    <Collapsible v-model:open="isExtraOptionsOpen">
      <CollapsibleTrigger class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
        {{ $t('planned.reminders.form.extraOptions') }}
        <ChevronDownIcon :class="['size-4 transition-transform', isExtraOptionsOpen && 'rotate-180']" />
      </CollapsibleTrigger>
      <CollapsibleContent class="mt-3 grid gap-4">
        <!-- Currency follows the selected account, so the standalone currency picker only
             appears as a fallback when no account is chosen yet. -->
        <div :class="['grid gap-3', selectedAccount ? 'grid-cols-1' : 'grid-cols-2']">
          <InputField
            v-model="form.expectedAmount"
            :label="$t('planned.reminders.form.amountLabel')"
            type="number"
            only-positive
            :placeholder="$t('planned.reminders.form.amountPlaceholder')"
            :disabled="isSubscriptionLinked"
          >
            <template v-if="selectedAccount?.currencyCode" #iconTrailing>
              <span>{{ selectedAccount.currencyCode }}</span>
            </template>
          </InputField>
          <SelectField
            v-if="!selectedAccount"
            :model-value="selectedCurrency"
            :values="currencyOptions"
            :label="$t('planned.reminders.form.currencyLabel')"
            :placeholder="$t('planned.reminders.form.currencyPlaceholder')"
            :disabled="isSubscriptionLinked"
            @update:model-value="(v: SelectOption | null) => (form.currencyCode = v?.value ?? '')"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <SelectField
            :model-value="selectedTimeSlot"
            :values="timeSlotOptions"
            :label="$t('planned.reminders.form.notificationTimeLabel')"
            @update:model-value="(v: SelectOption | null) => (form.preferredTime = Number(v?.value ?? 8))"
          />
          <div />
        </div>

        <TextareaField
          v-model="form.notes"
          :label="$t('planned.reminders.form.notesLabel')"
          :placeholder="$t('planned.reminders.form.notesPlaceholder')"
        />
      </CollapsibleContent>
    </Collapsible>

    <p v-if="error" class="text-destructive-text text-sm">{{ error }}</p>
  </form>
</template>
