<script setup lang="ts">
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useCreateInvestmentTransaction } from '@/composable/data-queries/investment-transactions';
import { useFormValidation } from '@/composable/form-validator';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types';
import { required } from '@vuelidate/validators';
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface SecurityOption {
  value: string;
  label: string;
}

const props = defineProps<{
  portfolioId: number;
  securities: SecurityOption[];
  securityId?: string | null;
}>();

const emit = defineEmits(['success', 'cancel']);

const { addNotification } = useNotificationCenter();
const createTransactionMutation = useCreateInvestmentTransaction();

const transactionTypeMap: Record<string, string> = {
  [INVESTMENT_TRANSACTION_CATEGORY.buy]: 'forms.investmentTransaction.types.buy',
  [INVESTMENT_TRANSACTION_CATEGORY.sell]: 'forms.investmentTransaction.types.sell',
  [INVESTMENT_TRANSACTION_CATEGORY.dividend]: 'forms.investmentTransaction.types.dividend',
};

const transactionTypes = computed(() =>
  Object.values(INVESTMENT_TRANSACTION_CATEGORY)
    .filter((type) =>
      [
        INVESTMENT_TRANSACTION_CATEGORY.buy,
        INVESTMENT_TRANSACTION_CATEGORY.sell,
        INVESTMENT_TRANSACTION_CATEGORY.dividend,
      ].includes(type),
    )
    .map((type) => ({
      value: type,
      label: t(transactionTypeMap[type]!),
    })),
);

const form = reactive({
  type: transactionTypes.value[0]!,
  security: null as SecurityOption | null,
  quantity: '',
  price: '',
  date: new Date(),
  fees: '',
});

watch(
  () => [props.securityId, props.securities],
  ([securityId, securities]) => {
    if (securityId && Array.isArray(securities) && securities.length) {
      form.security = securities.find((s) => s.value === securityId) || null;
    }
  },
  { immediate: true },
);

const validationRules = computed(() => ({
  security: { required },
  quantity: { required },
  price: { required },
  date: { required },
}));

const { isFormValid, getFieldErrorMessage, touchField, resetValidation } = useFormValidation(
  { form },
  computed(() => ({ form: validationRules.value })),
);

const resetForm = () => {
  form.type = { value: INVESTMENT_TRANSACTION_CATEGORY.buy, label: t('forms.investmentTransaction.types.buy') };
  form.security = null;
  form.quantity = '';
  form.price = '';
  form.date = new Date();
  form.fees = '';
  resetValidation();
};

const onSubmit = async () => {
  touchField('form.security');
  touchField('form.quantity');
  touchField('form.price');
  touchField('form.date');

  if (!isFormValid()) {
    return;
  }

  if (!form.security) return;

  try {
    await createTransactionMutation.mutateAsync({
      portfolioId: props.portfolioId,
      // This payload structure is an assumption and will need to be verified against the backend.
      category: form.type.value,
      securityId: form.security.value, // Assuming security value is the ID
      quantity: form.quantity,
      price: form.price,
      date: form.date.toISOString().slice(0, 10),
      fees: form.fees || '0',
    });

    addNotification({
      text: t('forms.investmentTransaction.notifications.success'),
      type: NotificationType.success,
    });

    resetForm();
    emit('success');
  } catch (error) {
    addNotification({
      text: error instanceof Error ? error.message : t('forms.investmentTransaction.notifications.error'),
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <form class="grid gap-6" @submit.prevent="onSubmit">
    <SelectField
      v-model="form.type"
      :label="$t('forms.investmentTransaction.typeLabel')"
      :values="transactionTypes"
      value-key="value"
      label-key="label"
      :disabled="createTransactionMutation.isPending.value"
    />

    <SelectField
      v-if="!securityId"
      v-model="form.security"
      :label="$t('forms.investmentTransaction.securityLabel')"
      :values="securities"
      value-key="value"
      label-key="label"
      :placeholder="$t('forms.investmentTransaction.securityPlaceholder')"
      :disabled="createTransactionMutation.isPending.value"
      :error-message="getFieldErrorMessage('form.security')"
      @blur="touchField('form.security')"
    />

    <InputField
      v-model="form.quantity"
      :label="$t('forms.investmentTransaction.quantityLabel')"
      type="number"
      step="any"
      :placeholder="$t('forms.investmentTransaction.quantityPlaceholder')"
      :disabled="createTransactionMutation.isPending.value"
      :error-message="getFieldErrorMessage('form.quantity')"
      @blur="touchField('form.quantity')"
    />

    <InputField
      v-model="form.price"
      :label="$t('forms.investmentTransaction.priceLabel')"
      type="number"
      step="any"
      :placeholder="$t('forms.investmentTransaction.pricePlaceholder')"
      :disabled="createTransactionMutation.isPending.value"
      :error-message="getFieldErrorMessage('form.price')"
      @blur="touchField('form.price')"
    />

    <InputField
      v-model="form.fees"
      :label="$t('forms.investmentTransaction.feesLabel')"
      type="number"
      step="any"
      :placeholder="$t('forms.investmentTransaction.feesPlaceholder')"
      :disabled="createTransactionMutation.isPending.value"
    />

    <DateField
      v-model="form.date"
      :label="$t('forms.investmentTransaction.dateLabel')"
      :disabled="createTransactionMutation.isPending.value"
      :error-message="getFieldErrorMessage('form.date')"
      @blur="touchField('form.date')"
    />

    <div class="flex justify-end gap-4">
      <UiButton
        type="button"
        variant="secondary"
        :disabled="createTransactionMutation.isPending.value"
        @click="emit('cancel')"
      >
        {{ $t('forms.investmentTransaction.cancelButton') }}
      </UiButton>

      <UiButton type="submit" :disabled="createTransactionMutation.isPending.value">
        {{
          createTransactionMutation.isPending.value
            ? $t('forms.investmentTransaction.submitButtonLoading')
            : $t('forms.investmentTransaction.submitButton')
        }}
      </UiButton>
    </div>
  </form>
</template>
