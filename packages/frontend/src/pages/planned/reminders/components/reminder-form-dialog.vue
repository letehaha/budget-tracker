<script setup lang="ts">
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import Label from '@/components/lib/ui/label/Label.vue';
import { usePrioritizedCurrencies } from '@/composable/data-queries/prioritized-currencies';
import {
  MAX_REMIND_BEFORE_PRESETS,
  PREFERRED_TIME_SLOTS,
  REMIND_BEFORE_PRESETS,
  type RemindBeforePreset,
  SUBSCRIPTION_FREQUENCIES,
} from '@bt/shared/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { ChevronDownIcon } from 'lucide-vue-next';
import { format } from 'date-fns';
import { computed, ref, watch } from 'vue';

import type { CreateReminderPayload, PaymentReminderDetail } from '@/api/payment-reminders';

type SelectOption = { value: string; label: string };

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
  categoryId: number | null;
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

const frequencyOptions: SelectOption[] = [
  { value: ONE_TIME_VALUE, label: 'One-time' },
  { value: SUBSCRIPTION_FREQUENCIES.weekly, label: 'Weekly' },
  { value: SUBSCRIPTION_FREQUENCIES.biweekly, label: 'Every 2 weeks' },
  { value: SUBSCRIPTION_FREQUENCIES.monthly, label: 'Monthly' },
  { value: SUBSCRIPTION_FREQUENCIES.quarterly, label: 'Quarterly' },
  { value: SUBSCRIPTION_FREQUENCIES.semiAnnual, label: 'Every 6 months' },
  { value: SUBSCRIPTION_FREQUENCIES.annual, label: 'Annually' },
];

const selectedFrequency = computed(() => frequencyOptions.find((o) => o.value === form.value.frequency) ?? null);

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

// --- Remind before ---

const remindBeforeOptions: { value: RemindBeforePreset; label: string }[] = [
  { value: REMIND_BEFORE_PRESETS.oneDay, label: '1 day before' },
  { value: REMIND_BEFORE_PRESETS.twoDays, label: '2 days before' },
  { value: REMIND_BEFORE_PRESETS.threeDays, label: '3 days before' },
  { value: REMIND_BEFORE_PRESETS.fiveDays, label: '5 days before' },
  { value: REMIND_BEFORE_PRESETS.oneWeek, label: '1 week before' },
  { value: REMIND_BEFORE_PRESETS.twoWeeks, label: '2 weeks before' },
  { value: REMIND_BEFORE_PRESETS.oneMonth, label: '1 month before' },
];

function toggleRemindBefore(preset: RemindBeforePreset) {
  const idx = form.value.remindBefore.indexOf(preset);
  if (idx >= 0) {
    form.value.remindBefore.splice(idx, 1);
  } else if (form.value.remindBefore.length < MAX_REMIND_BEFORE_PRESETS) {
    form.value.remindBefore.push(preset);
  }
}

// --- Submit ---

const isSubmitDisabled = computed(() => !form.value.name || !form.value.dueDate);

function setError({ error: msg }: { error: string }) {
  error.value = msg;
}

function handleSubmit() {
  if (isSubmitDisabled.value) return;
  error.value = '';

  if (isCreateMode.value && form.value.dueDate && form.value.dueDate < today.value) {
    error.value = 'Due date cannot be in the past';
    return;
  }

  const payload: CreateReminderPayload = {
    name: form.value.name,
    dueDate: format(form.value.dueDate!, 'yyyy-MM-dd'),
    frequency:
      form.value.frequency && form.value.frequency !== ONE_TIME_VALUE
        ? (form.value.frequency as SUBSCRIPTION_FREQUENCIES)
        : undefined,
    remindBefore: form.value.remindBefore.length ? form.value.remindBefore : undefined,
    notifyEmail: form.value.notifyEmail,
    preferredTime: form.value.preferredTime,
    timezone: form.value.timezone,
    categoryId: form.value.categoryId,
    notes: form.value.notes || undefined,
  };

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
      label="Name"
      placeholder="e.g. Rent, Insurance, Taxes..."
      :disabled="isSubscriptionLinked"
    />

    <DateField
      :model-value="form.dueDate ?? undefined"
      label="Due date"
      :calendar-options="isCreateMode ? { minDate: today } : undefined"
      @update:model-value="(v: Date) => (form.dueDate = v)"
    />

    <SelectField
      :model-value="selectedFrequency"
      :values="frequencyOptions"
      label="Frequency"
      :disabled="isSubscriptionLinked"
      @update:model-value="(v: SelectOption | null) => (form.frequency = v?.value ?? ONE_TIME_VALUE)"
    />

    <div class="grid grid-cols-2 gap-3">
      <InputField
        v-model="form.expectedAmount"
        label="Amount"
        type="number"
        placeholder="Optional"
        :disabled="isSubscriptionLinked"
      />
      <SelectField
        :model-value="selectedCurrency"
        :values="currencyOptions"
        label="Currency"
        placeholder="Select currency"
        :disabled="isSubscriptionLinked"
        @update:model-value="(v: SelectOption | null) => (form.currencyCode = v?.value ?? '')"
      />
    </div>

    <div>
      <Label class="mb-2 block text-sm font-medium"> Remind before (max {{ MAX_REMIND_BEFORE_PRESETS }}) </Label>
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

    <div class="grid grid-cols-2 gap-3">
      <SelectField
        :model-value="selectedTimeSlot"
        :values="timeSlotOptions"
        label="Notification time"
        @update:model-value="(v: SelectOption | null) => (form.preferredTime = Number(v?.value ?? 8))"
      />
      <div />
    </div>

    <div class="flex items-center gap-2">
      <Checkbox
        :id="`${formId}-email`"
        :model-value="form.notifyEmail"
        @update:model-value="(val) => (form.notifyEmail = !!val)"
      />
      <Label :for="`${formId}-email`" class="text-sm">Also send email notifications</Label>
    </div>

    <Collapsible v-model:open="isExtraOptionsOpen">
      <CollapsibleTrigger class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
        Extra options
        <ChevronDownIcon :class="['size-4 transition-transform', isExtraOptionsOpen && 'rotate-180']" />
      </CollapsibleTrigger>
      <CollapsibleContent class="mt-3 grid gap-4">
        <TextareaField v-model="form.notes" label="Notes" placeholder="Optional notes..." />
      </CollapsibleContent>
    </Collapsible>

    <p v-if="error" class="text-destructive-text text-sm">{{ error }}</p>
  </form>
</template>
