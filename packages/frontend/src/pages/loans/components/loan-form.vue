<script setup lang="ts">
import { type CreateLoanPayload, type LoanApi, type UpdateLoanPayload } from '@/api/loans';
import FieldLabel from '@/components/fields/components/field-label.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Select from '@/components/lib/ui/select';
import { useCurrencyName } from '@/composable';
import { useFormValidation } from '@/composable/form-validator';
import { useCurrenciesStore } from '@/stores';
import { LOAN_TYPE } from '@bt/shared/types';
import { between, helpers, integer, maxLength, required } from '@vuelidate/validators';
import { format, parseISO } from 'date-fns';
import { storeToRefs } from 'pinia';
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';

const MIN_INTEREST_RATE = 0;
// Backend caps at 99.9999; mirror that on the client so the server validation
// only kicks in for genuinely malicious requests.
const MAX_INTEREST_RATE = 99.9999;
const MIN_TERM_MONTHS = 1;
const MAX_TERM_MONTHS = 1200;

const props = withDefaults(
  defineProps<{
    mode?: 'create' | 'edit';
    initialLoan?: LoanApi | null;
    submitting?: boolean;
    submitLabel?: string;
  }>(),
  { mode: 'create', initialLoan: null, submitting: false, submitLabel: undefined },
);

const emit = defineEmits<{
  submit: [payload: CreateLoanPayload | UpdateLoanPayload];
  cancel: [];
}>();

const isEdit = computed(() => props.mode === 'edit');

const { t } = useI18n();
const currenciesStore = useCurrenciesStore();
const { formatCurrencyLabel } = useCurrencyName();
const { baseCurrency, systemCurrenciesVerbose } = storeToRefs(currenciesStore);

const defaultCurrency = computed(
  () =>
    systemCurrenciesVerbose.value.linked.find((i) => i.code === baseCurrency.value?.currencyCode)?.code ??
    systemCurrenciesVerbose.value.linked[0]?.code ??
    '',
);

interface FormState {
  name: string;
  currencyCode: string;
  /** Create: initialBalance (outstanding at creation). Edit: currentBalance. Always a positive decimal — service flips the sign. */
  balance: number | null;
  loanType: LOAN_TYPE;
  originalPrincipal: number | null;
  interestRate: number | null;
  termMonths: number | null;
  startDate: Date;
  minPayment: number | null;
  plannedPayment: number | null;
  paymentDayOfMonth: number | null;
  lenderName: string;
  accountNumber: string;
}

const buildInitialState = (): FormState => {
  if (props.initialLoan) {
    const loan = props.initialLoan;
    return {
      name: loan.name,
      currencyCode: loan.currencyCode,
      balance: Math.abs(loan.currentBalance),
      loanType: loan.loanDetails.loanType,
      originalPrincipal: loan.loanDetails.originalPrincipal,
      interestRate: loan.loanDetails.interestRate,
      termMonths: loan.loanDetails.termMonths,
      startDate: parseISO(loan.loanDetails.startDate),
      minPayment: loan.loanDetails.minPayment,
      plannedPayment: loan.loanDetails.plannedPayment,
      paymentDayOfMonth: loan.loanDetails.paymentDayOfMonth,
      lenderName: loan.loanDetails.lenderName ?? '',
      accountNumber: loan.loanDetails.accountNumber ?? '',
    };
  }
  return {
    name: '',
    currencyCode: String(defaultCurrency.value),
    balance: null,
    loanType: LOAN_TYPE.mortgage,
    originalPrincipal: null,
    interestRate: null,
    termMonths: null,
    startDate: new Date(),
    minPayment: null,
    plannedPayment: null,
    paymentDayOfMonth: null,
    lenderName: '',
    accountNumber: '',
  };
};

const form = reactive<FormState>(buildInitialState());

const loanTypeOptions = computed(() =>
  Object.values(LOAN_TYPE).map((value) => ({
    label: t(`loans.types.${value}`),
    value,
  })),
);

const selectedLoanType = computed(() => loanTypeOptions.value.find((o) => o.value === form.loanType) ?? null);

const positiveMoney = helpers.withMessage(
  () => t('forms.loan.errors.mustBePositive'),
  (v: unknown) => v !== null && v !== undefined && Number(v) > 0,
);

const nonNegativeMoney = helpers.withMessage(
  () => t('forms.loan.errors.mustBeNonNegative'),
  (v: unknown) => v === null || v === undefined || Number(v) >= 0,
);

const validationRules = {
  name: { required: helpers.withMessage(() => t('forms.loan.errors.required'), required), maxLength: maxLength(200) },
  currencyCode: { required: helpers.withMessage(() => t('forms.loan.errors.required'), required) },
  balance: {
    required: helpers.withMessage(() => t('forms.loan.errors.required'), required),
    nonNegative: nonNegativeMoney,
  },
  originalPrincipal: {
    required: helpers.withMessage(() => t('forms.loan.errors.required'), required),
    positive: positiveMoney,
  },
  interestRate: {
    required: helpers.withMessage(() => t('forms.loan.errors.required'), required),
    between: helpers.withMessage(
      () => t('forms.loan.errors.interestRateRange'),
      between(MIN_INTEREST_RATE, MAX_INTEREST_RATE),
    ),
  },
  termMonths: {
    integer,
    between: helpers.withMessage(
      () => t('forms.loan.errors.termRange'),
      (v: unknown) => v === null || v === undefined || (Number(v) >= MIN_TERM_MONTHS && Number(v) <= MAX_TERM_MONTHS),
    ),
  },
  minPayment: { nonNegative: nonNegativeMoney },
  plannedPayment: { nonNegative: nonNegativeMoney },
  paymentDayOfMonth: {
    integer,
    range: helpers.withMessage(
      () => t('forms.loan.errors.paymentDayRange'),
      (v: unknown) => v === null || v === undefined || (Number(v) >= 1 && Number(v) <= 31),
    ),
  },
  lenderName: { maxLength: maxLength(200) },
  accountNumber: { maxLength: maxLength(100) },
};

const { isFormValid, getFieldErrorMessage, touchField } = useFormValidation({ form }, { form: validationRules });

const submit = () => {
  if (props.submitting) return;
  if (!isFormValid()) return;

  if (isEdit.value) {
    const payload: UpdateLoanPayload = {
      name: form.name.trim(),
      currentBalance: Number(form.balance),
      interestRate: Number(form.interestRate),
      termMonths: form.termMonths === null ? null : Number(form.termMonths),
      startDate: format(form.startDate, 'yyyy-MM-dd'),
      minPayment: form.minPayment === null ? null : Number(form.minPayment),
      plannedPayment: form.plannedPayment === null ? null : Number(form.plannedPayment),
      paymentDayOfMonth: form.paymentDayOfMonth === null ? null : Number(form.paymentDayOfMonth),
      lenderName: form.lenderName.trim() || null,
      accountNumber: form.accountNumber.trim() || null,
    };
    emit('submit', payload);
    return;
  }

  const payload: CreateLoanPayload = {
    name: form.name.trim(),
    currencyCode: form.currencyCode,
    initialBalance: Number(form.balance),
    loanType: form.loanType,
    originalPrincipal: Number(form.originalPrincipal),
    interestRate: Number(form.interestRate),
    termMonths: form.termMonths === null ? null : Number(form.termMonths),
    startDate: format(form.startDate, 'yyyy-MM-dd'),
    minPayment: form.minPayment === null ? null : Number(form.minPayment),
    plannedPayment: form.plannedPayment === null ? null : Number(form.plannedPayment),
    paymentDayOfMonth: form.paymentDayOfMonth === null ? null : Number(form.paymentDayOfMonth),
    lenderName: form.lenderName.trim() || null,
    accountNumber: form.accountNumber.trim() || null,
  };

  emit('submit', payload);
};
</script>

<template>
  <form class="@container/loan-form grid gap-6" @submit.prevent="submit">
    <InputField
      v-model="form.name"
      :label="$t('forms.loan.nameLabel')"
      :placeholder="$t('forms.loan.namePlaceholder')"
      :error-message="getFieldErrorMessage('form.name')"
      @blur="touchField('form.name')"
    />

    <SelectField
      v-if="!isEdit"
      :model-value="selectedLoanType"
      :values="loanTypeOptions"
      label-key="label"
      value-key="value"
      :label="$t('forms.loan.loanTypeLabel')"
      @update:model-value="(v) => v && (form.loanType = v.value)"
    />

    <div v-if="!isEdit">
      <FieldLabel :label="$t('forms.loan.currencyLabel')">
        <Select.Select v-model="form.currencyCode">
          <Select.SelectTrigger>
            <Select.SelectValue />
          </Select.SelectTrigger>
          <Select.SelectContent>
            <template v-for="item of systemCurrenciesVerbose.linked" :key="item.code">
              <Select.SelectItem :value="String(item.code)">
                {{ formatCurrencyLabel({ code: item.code, fallbackName: item.currency }) }}
              </Select.SelectItem>
            </template>
          </Select.SelectContent>
        </Select.Select>
      </FieldLabel>
    </div>

    <div class="grid grid-cols-1 items-end gap-4 @sm/loan-form:grid-cols-2">
      <InputField
        v-if="!isEdit"
        v-model="form.originalPrincipal"
        type="number"
        :label="$t('forms.loan.originalPrincipalLabel')"
        :placeholder="$t('forms.loan.originalPrincipalPlaceholder')"
        :error-message="getFieldErrorMessage('form.originalPrincipal')"
        @blur="touchField('form.originalPrincipal')"
      />
      <InputField
        v-model="form.balance"
        type="number"
        :label="isEdit ? $t('forms.loan.currentBalanceLabel') : $t('forms.loan.initialBalanceLabel')"
        :placeholder="$t('forms.loan.initialBalancePlaceholder')"
        :error-message="getFieldErrorMessage('form.balance')"
        @blur="touchField('form.balance')"
      />
    </div>

    <div class="grid grid-cols-1 items-end gap-4 @sm/loan-form:grid-cols-2">
      <InputField
        v-model="form.interestRate"
        type="number"
        :label="$t('forms.loan.interestRateLabel')"
        :placeholder="$t('forms.loan.interestRatePlaceholder')"
        :error-message="getFieldErrorMessage('form.interestRate')"
        @blur="touchField('form.interestRate')"
      />
      <InputField
        v-model="form.termMonths"
        type="number"
        :label="$t('forms.loan.termMonthsLabel')"
        :placeholder="$t('forms.loan.termMonthsPlaceholder')"
        :error-message="getFieldErrorMessage('form.termMonths')"
        @blur="touchField('form.termMonths')"
      />
    </div>

    <DateField v-model="form.startDate" :label="$t('forms.loan.startDateLabel')" />

    <div class="grid grid-cols-1 items-end gap-4 @sm/loan-form:grid-cols-2">
      <InputField
        v-model="form.plannedPayment"
        type="number"
        :label="$t('forms.loan.plannedPaymentLabel')"
        :placeholder="$t('forms.loan.plannedPaymentPlaceholder')"
        :error-message="getFieldErrorMessage('form.plannedPayment')"
        @blur="touchField('form.plannedPayment')"
      />
      <InputField
        v-model="form.minPayment"
        type="number"
        :label="$t('forms.loan.minPaymentLabel')"
        :placeholder="$t('forms.loan.minPaymentPlaceholder')"
        :error-message="getFieldErrorMessage('form.minPayment')"
        @blur="touchField('form.minPayment')"
      />
    </div>

    <InputField
      v-model="form.paymentDayOfMonth"
      type="number"
      :label="$t('forms.loan.paymentDayLabel')"
      :placeholder="$t('forms.loan.paymentDayPlaceholder')"
      :error-message="getFieldErrorMessage('form.paymentDayOfMonth')"
      @blur="touchField('form.paymentDayOfMonth')"
    />

    <div class="grid grid-cols-1 items-end gap-4 @sm/loan-form:grid-cols-2">
      <InputField
        v-model="form.lenderName"
        :label="$t('forms.loan.lenderNameLabel')"
        :placeholder="$t('forms.loan.lenderNamePlaceholder')"
        :error-message="getFieldErrorMessage('form.lenderName')"
        @blur="touchField('form.lenderName')"
      />
      <InputField
        v-model="form.accountNumber"
        :label="$t('forms.loan.accountNumberLabel')"
        :placeholder="$t('forms.loan.accountNumberPlaceholder')"
        :error-message="getFieldErrorMessage('form.accountNumber')"
        @blur="touchField('form.accountNumber')"
      />
    </div>

    <div class="flex justify-end gap-2">
      <UiButton type="button" variant="ghost" :disabled="submitting" @click="emit('cancel')">
        {{ $t('forms.loan.cancelButton') }}
      </UiButton>
      <UiButton type="submit" class="min-w-30" :disabled="submitting">
        {{ submitting ? $t('forms.loan.submitButtonLoading') : (submitLabel ?? $t('forms.loan.submitButton')) }}
      </UiButton>
    </div>
  </form>
</template>
