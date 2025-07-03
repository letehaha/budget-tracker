<script setup lang="ts">
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import {
  type TransferContext,
  type TransferType,
  useCreatePortfolioTransfer,
} from '@/composable/data-queries/portfolio-transfers';
import { usePortfolios } from '@/composable/data-queries/portfolios';
import { useFormValidation } from '@/composable/form-validator';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { AccountModel, PortfolioModel, UserCurrencyModel } from '@bt/shared/types';
import { minValue, required } from '@vuelidate/validators';
import { storeToRefs } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';

interface Emit {
  (e: 'success'): void;
  (e: 'cancel'): void;
}

const props = defineProps<{
  /** Transfer context - determines which page this form is used on */
  context: TransferContext;
  /** Initial source portfolio (when context is 'portfolio') */
  initialPortfolio?: PortfolioModel;
  /** Initial source account (when context is 'account') */
  initialAccount?: AccountModel;
  /** Disable the form inputs */
  disabled?: boolean;
}>();

const emit = defineEmits<Emit>();

const { addNotification } = useNotificationCenter();
const { systemAccounts } = storeToRefs(useAccountsStore());
const { currencies } = storeToRefs(useCurrenciesStore());
const { data: portfolios } = usePortfolios();

const createTransferMutation = useCreatePortfolioTransfer();

// Form state
const form = reactive<{
  fromPortfolio: PortfolioModel | null;
  toPortfolio: PortfolioModel | null;
  fromAccount: AccountModel | null;
  toAccount: AccountModel | null;
  transferTypeOption: { value: TransferType; label: string } | null;
  amount: string;
  selectedCurrency: UserCurrencyModel | null;
  date: Date;
  description: string;
}>({
  fromPortfolio: props.context === 'portfolio' ? props.initialPortfolio || null : null,
  toPortfolio: null,
  fromAccount: props.context === 'account' ? props.initialAccount || null : null,
  toAccount: null,
  transferTypeOption: null,
  amount: '',
  selectedCurrency: null,
  date: new Date(),
  description: '',
});

// Computed values for easier access
const transferType = computed(() => form.transferTypeOption?.value || 'portfolio-to-portfolio');

// Transfer type options based on context
const transferTypeOptions = computed(() => {
  if (props.context === 'portfolio') {
    return [
      { value: 'portfolio-to-portfolio' as TransferType, label: 'To Another Portfolio' },
      { value: 'portfolio-to-account' as TransferType, label: 'To Account' },
    ];
  } else {
    return [{ value: 'account-to-portfolio' as TransferType, label: 'To Portfolio (Coming Soon)', disabled: true }];
  }
});

// Initialize default transfer type
watch(
  () => props.context,
  (context) => {
    if (!form.transferTypeOption) {
      const defaultType: TransferType = context === 'portfolio' ? 'portfolio-to-portfolio' : 'account-to-portfolio';
      form.transferTypeOption = transferTypeOptions.value.find((opt) => opt.value === defaultType) || null;
    }
  },
  { immediate: true },
);

// Confirmation dialog state
const showConfirmDialog = ref(false);
const confirmDialogData = ref<{
  from: string;
  to: string;
  amount: string;
  currency: string;
} | null>(null);

// Available options based on transfer type and selections
const availableFromPortfolios = computed(() => {
  if (props.context === 'account') return [];
  return portfolios.value?.filter((p) => p.id !== form.toPortfolio?.id) || [];
});

const availableToPortfolios = computed(() => {
  if (transferType.value === 'portfolio-to-account') return [];
  return portfolios.value?.filter((p) => p.id !== form.fromPortfolio?.id) || [];
});

const availableFromAccounts = computed(() => {
  if (props.context === 'portfolio') return [];
  return systemAccounts.value.filter((a) => a.id !== form.toAccount?.id);
});

const availableToAccounts = computed(() => {
  if (transferType.value === 'portfolio-to-portfolio' || transferType.value === 'account-to-portfolio') return [];
  return systemAccounts.value.filter((a) => a.id !== form.fromAccount?.id);
});

// Field visibility based on context and transfer type
const showFromPortfolio = computed(
  () =>
    props.context === 'portfolio' &&
    (transferType.value === 'portfolio-to-portfolio' || transferType.value === 'portfolio-to-account'),
);

const showToPortfolio = computed(
  () => transferType.value === 'portfolio-to-portfolio' || transferType.value === 'account-to-portfolio',
);

const showFromAccount = computed(() => props.context === 'account' && transferType.value === 'account-to-portfolio');

const showToAccount = computed(() => transferType.value === 'portfolio-to-account');

// Dynamic labels based on context
const amountLabel = computed(() => {
  return form.selectedCurrency ? `Amount (${form.selectedCurrency.currency.code})` : 'Amount';
});

// Form validation
const validationRules = computed(() => ({
  amount: {
    required,
    minValue: minValue(0.01),
  },
  selectedCurrency: {
    required,
  },
  date: {
    required,
  },
  transferTypeOption: {
    required,
  },
}));

const { isFormValid, getFieldErrorMessage, touchField, resetValidation } = useFormValidation(
  { form },
  { form: validationRules },
  {},
  {
    customValidationMessages: {
      required: 'This field is required',
      minValue: 'Amount must be greater than 0',
    },
  },
);

// Auto-set currency based on source
watch(
  [() => form.fromPortfolio, () => form.fromAccount],
  () => {
    const sourceCurrencyId = form.fromPortfolio?.balances?.[0]?.currencyId || form.fromAccount?.currencyId;
    if (sourceCurrencyId && !form.selectedCurrency) {
      form.selectedCurrency = currencies.value?.find((c) => c.currencyId === sourceCurrencyId) || null;
    }
  },
  { immediate: true },
);

// Update transfer type based on selections
watch([() => form.fromPortfolio, () => form.toPortfolio, () => form.fromAccount, () => form.toAccount], () => {
  let newType: TransferType;
  if (form.fromPortfolio && form.toPortfolio) {
    newType = 'portfolio-to-portfolio';
  } else if (form.fromPortfolio && form.toAccount) {
    newType = 'portfolio-to-account';
  } else if (form.fromAccount && form.toPortfolio) {
    newType = 'account-to-portfolio';
  } else {
    return;
  }
  form.transferTypeOption = transferTypeOptions.value.find((opt) => opt.value === newType) || null;
});

// Clear conflicting selections when transfer type changes
watch(
  () => transferType.value,
  (newType) => {
    if (newType === 'portfolio-to-portfolio') {
      form.fromAccount = null;
      form.toAccount = null;
    } else if (newType === 'portfolio-to-account') {
      form.toPortfolio = null;
      form.fromAccount = null;
    } else if (newType === 'account-to-portfolio') {
      form.fromPortfolio = null;
      form.toAccount = null;
    }
  },
);

const resetForm = () => {
  form.fromPortfolio = props.context === 'portfolio' ? props.initialPortfolio || null : null;
  form.toPortfolio = null;
  form.fromAccount = props.context === 'account' ? props.initialAccount || null : null;
  form.toAccount = null;
  const defaultType: TransferType = props.context === 'portfolio' ? 'portfolio-to-portfolio' : 'account-to-portfolio';
  form.transferTypeOption = transferTypeOptions.value.find((opt) => opt.value === defaultType) || null;
  form.amount = '';
  form.selectedCurrency = null;
  form.date = new Date();
  form.description = '';

  resetValidation();
};

const validateForm = (): boolean => {
  touchField('form.transferTypeOption');
  touchField('form.amount');
  touchField('form.selectedCurrency');
  touchField('form.date');

  if (!form.fromPortfolio && !form.fromAccount) {
    return false;
  }

  if (!form.toPortfolio && !form.toAccount) {
    return false;
  }

  return isFormValid('form');
};

const prepareConfirmationData = () => {
  let fromName = '';
  let toName = '';

  if (transferType.value === 'portfolio-to-portfolio') {
    fromName = form.fromPortfolio?.name || '';
    toName = form.toPortfolio?.name || '';
  } else if (transferType.value === 'portfolio-to-account') {
    fromName = form.fromPortfolio?.name || '';
    toName = form.toAccount?.name || '';
  } else if (transferType.value === 'account-to-portfolio') {
    fromName = form.fromAccount?.name || '';
    toName = form.toPortfolio?.name || '';
  }

  confirmDialogData.value = {
    from: fromName,
    to: toName,
    amount: form.amount,
    currency: form.selectedCurrency?.currency.code || '',
  };
};

const onSubmit = () => {
  if (!validateForm()) return;

  prepareConfirmationData();
  showConfirmDialog.value = true;
};

const confirmTransfer = async () => {
  try {
    showConfirmDialog.value = false;

    if (transferType.value === 'portfolio-to-portfolio' || transferType.value === 'portfolio-to-account') {
      await createTransferMutation.mutateAsync({
        fromPortfolioId: form.fromPortfolio!.id,
        toPortfolioId: form.toPortfolio?.id || 0, // 0 for account transfers
        currencyId: form.selectedCurrency!.currencyId,
        amount: form.amount,
        date: form.date.toISOString().split('T')[0],
        description: form.description || undefined,
      });
    } else {
      // Account-to-portfolio transfers - disabled until post-MVP implementation
      addNotification({
        text: 'Account-to-portfolio transfers are coming in a future update!',
        type: NotificationType.info,
      });
      return;
    }

    addNotification({
      text: 'Transfer completed successfully.',
      type: NotificationType.success,
    });

    resetForm();
    emit('success');
  } catch (error) {
    addNotification({
      text: error instanceof Error ? error.message : 'Transfer failed. Please try again.',
      type: NotificationType.error,
    });
  }
};

const isSubmitDisabled = computed(
  () =>
    props.disabled ||
    createTransferMutation.isPending.value ||
    !form.amount.trim() ||
    !form.selectedCurrency ||
    (!form.fromPortfolio && !form.fromAccount) ||
    (!form.toPortfolio && !form.toAccount),
);
</script>

<template>
  <form class="grid gap-6" @submit.prevent="onSubmit">
    <!-- Transfer Type Selection -->
    <SelectField
      v-model="form.transferTypeOption"
      label="Transfer Type"
      :values="transferTypeOptions"
      value-key="value"
      label-key="label"
      :disabled="createTransferMutation.isPending.value || disabled"
      :error-message="getFieldErrorMessage('form.transferTypeOption')"
    />
    
    <!-- Coming Soon Notice for Account Context -->
    <div v-if="props.context === 'account'" class="text-sm text-muted-foreground italic">
      💡 Account-to-portfolio transfers are coming in a future update!
    </div>

    <!-- From Portfolio Field -->
    <SelectField
      v-if="showFromPortfolio"
      v-model="form.fromPortfolio"
      label="From Portfolio"
      :values="availableFromPortfolios"
      value-key="id"
      label-key="name"
      placeholder="Select source portfolio"
      :disabled="createTransferMutation.isPending.value || disabled || props.context === 'portfolio'"
    />

    <!-- From Account Field -->
    <SelectField
      v-if="showFromAccount"
      v-model="form.fromAccount"
      label="From Account"
      :values="availableFromAccounts"
      value-key="id"
      label-key="name"
      placeholder="Select source account"
      :disabled="createTransferMutation.isPending.value || disabled || props.context === 'account'"
    />

    <!-- To Portfolio Field -->
    <SelectField
      v-if="showToPortfolio"
      v-model="form.toPortfolio"
      label="To Portfolio"
      :values="availableToPortfolios"
      value-key="id"
      label-key="name"
      placeholder="Select destination portfolio"
      :disabled="createTransferMutation.isPending.value || disabled"
    />

    <!-- To Account Field -->
    <SelectField
      v-if="showToAccount"
      v-model="form.toAccount"
      label="To Account"
      :values="availableToAccounts"
      value-key="id"
      label-key="name"
      placeholder="Select destination account"
      :disabled="createTransferMutation.isPending.value || disabled"
    />

    <!-- Currency Selection -->
    <SelectField
      v-model="form.selectedCurrency"
      label="Currency"
      :values="currencies || []"
      value-key="currencyId"
      :label-key="(currency) => currency.currency.code"
      placeholder="Select currency"
      :disabled="createTransferMutation.isPending.value || disabled"
      :error-message="getFieldErrorMessage('form.selectedCurrency')"
    />

    <!-- Amount Input -->
    <InputField
      v-model="form.amount"
      :label="amountLabel"
      type="number"
      step="0.01"
      min="0.01"
      placeholder="0.00"
      :disabled="createTransferMutation.isPending.value || disabled"
      :error="getFieldErrorMessage('form.amount')"
      @blur="touchField('form.amount')"
    />

    <!-- Date Field -->
    <DateField
      v-model="form.date"
      label="Date"
      :disabled="createTransferMutation.isPending.value || disabled"
      :error-message="getFieldErrorMessage('form.date')"
      @blur="touchField('form.date')"
    />

    <!-- Description Field -->
    <TextareaField
      v-model="form.description"
      label="Description (optional)"
      placeholder="Add a note about this transfer..."
      :disabled="createTransferMutation.isPending.value || disabled"
    />

    <!-- Action Buttons -->
    <div class="flex gap-4 justify-end">
      <UiButton
        type="button"
        variant="secondary"
        @click="emit('cancel')"
        :disabled="createTransferMutation.isPending.value || disabled"
      >
        Cancel
      </UiButton>
      <UiButton type="submit" class="min-w-[120px]" :disabled="isSubmitDisabled">
        {{ createTransferMutation.isPending.value ? 'Processing...' : 'Transfer' }}
      </UiButton>
    </div>

    <!-- Confirmation Dialog -->
    <AlertDialog.AlertDialog v-model:open="showConfirmDialog">
      <AlertDialog.AlertDialogContent>
        <AlertDialog.AlertDialogHeader>
          <AlertDialog.AlertDialogTitle>Confirm Transfer</AlertDialog.AlertDialogTitle>
          <AlertDialog.AlertDialogDescription>
            Are you sure you want to transfer
            <strong>{{ confirmDialogData?.amount }} {{ confirmDialogData?.currency }}</strong>
            from <strong>{{ confirmDialogData?.from }}</strong> to <strong>{{ confirmDialogData?.to }}</strong
            >? <br /><br />
            This action cannot be undone.
          </AlertDialog.AlertDialogDescription>
        </AlertDialog.AlertDialogHeader>
        <AlertDialog.AlertDialogFooter>
          <AlertDialog.AlertDialogCancel>Cancel</AlertDialog.AlertDialogCancel>
          <AlertDialog.AlertDialogAction variant="default" @click="confirmTransfer">
            Confirm Transfer
          </AlertDialog.AlertDialogAction>
        </AlertDialog.AlertDialogFooter>
      </AlertDialog.AlertDialogContent>
    </AlertDialog.AlertDialog>
  </form>
</template>

<style scoped>
form {
  max-width: 600px;
  width: 100%;
}
</style>
