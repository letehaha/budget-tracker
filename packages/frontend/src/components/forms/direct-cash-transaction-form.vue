<script setup lang="ts">
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useCreateDirectCashTransaction } from '@/composable/data-queries/portfolio-transfers';
import { useFormValidation } from '@/composable/form-validator';
import { useCurrenciesStore } from '@/stores';
import type { UserCurrencyModel } from '@bt/shared/types';
import { minValue, required } from '@vuelidate/validators';
import { storeToRefs } from 'pinia';
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';

interface Emit {
  (e: 'success'): void;
  (e: 'cancel'): void;
}

const props = defineProps<{
  portfolioId: number;
  disabled?: boolean;
}>();

const emit = defineEmits<Emit>();

const { t } = useI18n();
const { addNotification } = useNotificationCenter();
const { currencies } = storeToRefs(useCurrenciesStore());

const cashTransactionMutation = useCreateDirectCashTransaction();

const transactionTypeOptions = computed(() => [
  { value: 'deposit' as const, label: t('forms.directCashTransaction.typeDeposit') },
  { value: 'withdrawal' as const, label: t('forms.directCashTransaction.typeWithdrawal') },
]);

const form = reactive<{
  typeOption: { value: 'deposit' | 'withdrawal'; label: string } | null;
  amount: string;
  selectedCurrency: UserCurrencyModel | null;
  date: Date;
  description: string;
}>({
  typeOption: null,
  amount: '',
  selectedCurrency: null,
  date: new Date(),
  description: '',
});

const validationRules = computed(() => ({
  amount: { required, minValue: minValue(0.01) },
  selectedCurrency: { required },
  date: { required },
  typeOption: { required },
}));

const { isFormValid, getFieldErrorMessage, touchField, resetValidation } = useFormValidation(
  { form },
  { form: validationRules },
  {},
  {
    customValidationMessages: {
      required: t('forms.directCashTransaction.validation.required'),
      minValue: t('forms.directCashTransaction.validation.minValue'),
    },
  },
);

const resetForm = () => {
  form.typeOption = null;
  form.amount = '';
  form.selectedCurrency = null;
  form.date = new Date();
  form.description = '';
  resetValidation();
};

const onSubmit = async () => {
  touchField('form.typeOption');
  touchField('form.amount');
  touchField('form.selectedCurrency');
  touchField('form.date');

  if (!isFormValid('form')) return;

  try {
    await cashTransactionMutation.mutateAsync({
      portfolioId: props.portfolioId,
      type: form.typeOption!.value,
      amount: String(form.amount),
      currencyCode: form.selectedCurrency!.currencyCode,
      date: form.date.toISOString().split('T')[0]!,
      description: form.description || undefined,
    });

    addNotification({
      text: t('forms.directCashTransaction.notifications.success'),
      type: NotificationType.success,
    });

    resetForm();
    emit('success');
  } catch (error) {
    addNotification({
      text: error instanceof Error ? error.message : t('forms.directCashTransaction.notifications.error'),
      type: NotificationType.error,
    });
  }
};

const isSubmitDisabled = computed(
  () =>
    props.disabled ||
    cashTransactionMutation.isPending.value ||
    !form.amount ||
    !form.selectedCurrency ||
    !form.typeOption,
);
</script>

<template>
  <form class="grid w-full max-w-150 gap-6" @submit.prevent="onSubmit">
    <SelectField
      v-model="form.typeOption"
      :label="$t('forms.directCashTransaction.typeLabel')"
      :values="transactionTypeOptions"
      value-key="value"
      label-key="label"
      :disabled="cashTransactionMutation.isPending.value || disabled"
      :error-message="getFieldErrorMessage('form.typeOption')"
    />

    <InputField
      v-model="form.amount"
      :label="$t('forms.directCashTransaction.amountLabel')"
      type="number"
      step="0.01"
      min="0.01"
      :placeholder="$t('forms.directCashTransaction.amountPlaceholder')"
      :disabled="cashTransactionMutation.isPending.value || disabled"
      :error="getFieldErrorMessage('form.amount')"
      @blur="touchField('form.amount')"
    />

    <SelectField
      v-model="form.selectedCurrency"
      :label="$t('forms.directCashTransaction.currencyLabel')"
      :values="currencies || []"
      value-key="currencyCode"
      :label-key="(currency: UserCurrencyModel) => currency.currency!.code"
      :placeholder="$t('forms.directCashTransaction.currencyPlaceholder')"
      :disabled="cashTransactionMutation.isPending.value || disabled"
      :error-message="getFieldErrorMessage('form.selectedCurrency')"
    />

    <DateField
      v-model="form.date"
      :label="$t('forms.directCashTransaction.dateLabel')"
      :disabled="cashTransactionMutation.isPending.value || disabled"
      :error-message="getFieldErrorMessage('form.date')"
      @blur="touchField('form.date')"
    />

    <TextareaField
      v-model="form.description"
      :label="$t('forms.directCashTransaction.descriptionLabel')"
      :placeholder="$t('forms.directCashTransaction.descriptionPlaceholder')"
      :disabled="cashTransactionMutation.isPending.value || disabled"
    />

    <div class="flex justify-end gap-4">
      <UiButton
        type="button"
        variant="secondary"
        :disabled="cashTransactionMutation.isPending.value || disabled"
        @click="emit('cancel')"
      >
        {{ $t('forms.directCashTransaction.cancelButton') }}
      </UiButton>
      <UiButton type="submit" class="min-w-30" :disabled="isSubmitDisabled">
        {{
          cashTransactionMutation.isPending.value
            ? $t('forms.directCashTransaction.submitButtonLoading')
            : $t('forms.directCashTransaction.submitButton')
        }}
      </UiButton>
    </div>
  </form>
</template>
