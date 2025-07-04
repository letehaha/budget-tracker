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
      label: type.charAt(0).toUpperCase() + type.slice(1),
    })),
);

const form = reactive({
  type: transactionTypes.value[0],
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
  form.type = { value: INVESTMENT_TRANSACTION_CATEGORY.buy, label: 'Buy' };
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
      text: 'Transaction created successfully.',
      type: NotificationType.success,
    });

    resetForm();
    emit('success');
  } catch (error) {
    addNotification({
      text: error instanceof Error ? error.message : 'Failed to create transaction.',
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <form class="grid gap-6" @submit.prevent="onSubmit">
    <SelectField
      v-model="form.type"
      label="Transaction Type"
      :values="transactionTypes"
      value-key="value"
      label-key="label"
      :disabled="createTransactionMutation.isPending.value"
    />

    <SelectField
      v-if="!securityId"
      v-model="form.security"
      label="Security"
      :values="securities"
      value-key="value"
      label-key="label"
      placeholder="Select a security"
      :disabled="createTransactionMutation.isPending.value"
      :error-message="getFieldErrorMessage('form.security')"
      @blur="touchField('form.security')"
    />

    <InputField
      v-model="form.quantity"
      label="Quantity"
      type="number"
      step="any"
      placeholder="0.00"
      :disabled="createTransactionMutation.isPending.value"
      :error-message="getFieldErrorMessage('form.quantity')"
      @blur="touchField('form.quantity')"
    />

    <InputField
      v-model="form.price"
      label="Price per Share"
      type="number"
      step="any"
      placeholder="0.00"
      :disabled="createTransactionMutation.isPending.value"
      :error-message="getFieldErrorMessage('form.price')"
      @blur="touchField('form.price')"
    />

    <InputField
      v-model="form.fees"
      label="Fees (optional)"
      type="number"
      step="any"
      placeholder="0.00"
      :disabled="createTransactionMutation.isPending.value"
    />

    <DateField
      v-model="form.date"
      label="Transaction Date"
      :disabled="createTransactionMutation.isPending.value"
      :error-message="getFieldErrorMessage('form.date')"
      @blur="touchField('form.date')"
    />

    <div class="flex gap-4 justify-end">
      <UiButton
        type="button"
        variant="secondary"
        @click="emit('cancel')"
        :disabled="createTransactionMutation.isPending.value"
      >
        Cancel
      </UiButton>

      <UiButton type="submit" :disabled="createTransactionMutation.isPending.value">
        {{ createTransactionMutation.isPending.value ? 'Creating...' : 'Create Transaction' }}
      </UiButton>
    </div>
  </form>
</template>
