<script setup lang="ts">
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable';
import {
  type TransferContext,
  type TransferType,
  useAccountToPortfolioTransfer,
  useCreatePortfolioTransfer,
  usePortfolioToAccountTransfer,
} from '@/composable/data-queries/portfolio-transfers';
import { usePortfolios } from '@/composable/data-queries/portfolios';
import { useFormValidation } from '@/composable/form-validator';
import { formatUIAmount } from '@/js/helpers';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { AccountModel, PortfolioModel, UserCurrencyModel } from '@bt/shared/types';
import { minValue, required } from '@vuelidate/validators';
import { storeToRefs } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

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

const { t } = useI18n();
const { addNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const { systemAccounts } = storeToRefs(useAccountsStore());
const { currencies } = storeToRefs(useCurrenciesStore());
const { data: portfolios } = usePortfolios();
const { formatAmountByCurrencyCode } = useFormatCurrency();

const createTransferMutation = useCreatePortfolioTransfer();
const accountToPortfolioMutation = useAccountToPortfolioTransfer();
const portfolioToAccountMutation = usePortfolioToAccountTransfer();

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
      {
        value: 'portfolio-to-portfolio' as TransferType,
        label: t('forms.portfolioTransfer.transferTypes.portfolioToPortfolio'),
      },
      {
        value: 'portfolio-to-account' as TransferType,
        label: t('forms.portfolioTransfer.transferTypes.portfolioToAccount'),
      },
    ];
  } else {
    return [
      {
        value: 'account-to-portfolio' as TransferType,
        label: t('forms.portfolioTransfer.transferTypes.accountToPortfolio'),
      },
    ];
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
  return form.selectedCurrency
    ? t('forms.portfolioTransfer.amountLabelWithCurrency', { currency: form.selectedCurrency.currency!.code })
    : t('forms.portfolioTransfer.amountLabel');
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
      required: t('forms.portfolioTransfer.validation.required'),
      minValue: t('forms.portfolioTransfer.validation.minValue'),
    },
  },
);

// Auto-set currency based on source.
// For account-to-portfolio, always lock currency to the account's currency.
watch(
  [() => form.fromPortfolio, () => form.fromAccount, () => transferType.value],
  () => {
    if (transferType.value === 'account-to-portfolio' && form.fromAccount?.currencyCode) {
      form.selectedCurrency = currencies.value?.find((c) => c.currencyCode === form.fromAccount!.currencyCode) || null;
      return;
    }

    const sourceCurrencyCode = form.fromPortfolio?.balances?.[0]?.currencyCode || form.fromAccount?.currencyCode;
    if (sourceCurrencyCode && !form.selectedCurrency) {
      form.selectedCurrency = currencies.value?.find((c) => c.currencyCode === sourceCurrencyCode) || null;
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
    amount: formatAmountByCurrencyCode(Number(form.amount), form.selectedCurrency?.currency!.code!),
    currency: form.selectedCurrency?.currency!.code || '',
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

    const dateStr = form.date.toISOString().split('T')[0]!;
    const amount = String(form.amount);

    if (transferType.value === 'portfolio-to-portfolio') {
      await createTransferMutation.mutateAsync({
        fromPortfolioId: form.fromPortfolio!.id,
        toPortfolioId: form.toPortfolio!.id,
        currencyCode: form.selectedCurrency!.currencyCode,
        amount,
        date: dateStr,
        description: form.description || undefined,
      });
    } else if (transferType.value === 'portfolio-to-account') {
      await portfolioToAccountMutation.mutateAsync({
        portfolioId: form.fromPortfolio!.id,
        accountId: form.toAccount!.id,
        amount,
        currencyCode: form.selectedCurrency!.currencyCode,
        date: dateStr,
        description: form.description || undefined,
      });
    } else {
      await accountToPortfolioMutation.mutateAsync({
        portfolioId: form.toPortfolio!.id,
        accountId: form.fromAccount!.id,
        amount,
        date: dateStr,
        description: form.description || undefined,
      });
    }

    addNotification({
      text: t('forms.portfolioTransfer.notifications.success'),
      type: NotificationType.success,
    });

    resetForm();
    accountsStore.refetchAccounts();
    emit('success');
  } catch (error) {
    addNotification({
      text: error instanceof Error ? error.message : t('forms.portfolioTransfer.notifications.error'),
      type: NotificationType.error,
    });
  }
};

const isAnyMutationPending = computed(
  () =>
    createTransferMutation.isPending.value ||
    accountToPortfolioMutation.isPending.value ||
    portfolioToAccountMutation.isPending.value,
);

const isSubmitDisabled = computed(
  () =>
    props.disabled ||
    isAnyMutationPending.value ||
    !form.amount ||
    !form.selectedCurrency ||
    (!form.fromPortfolio && !form.fromAccount) ||
    (!form.toPortfolio && !form.toAccount),
);
</script>

<template>
  <form class="grid w-full max-w-150 gap-6" @submit.prevent="onSubmit">
    <SelectField
      v-model="form.transferTypeOption"
      :label="$t('forms.portfolioTransfer.transferTypeLabel')"
      :values="transferTypeOptions"
      value-key="value"
      label-key="label"
      :disabled="isAnyMutationPending || disabled"
      :error-message="getFieldErrorMessage('form.transferTypeOption')"
    />

    <SelectField
      v-if="showFromPortfolio"
      v-model="form.fromPortfolio"
      :label="$t('forms.portfolioTransfer.fromPortfolioLabel')"
      :values="availableFromPortfolios"
      value-key="id"
      label-key="name"
      :placeholder="$t('forms.portfolioTransfer.fromPortfolioPlaceholder')"
      :disabled="isAnyMutationPending || disabled || props.context === 'portfolio'"
    />

    <SelectField
      v-if="showFromAccount"
      v-model="form.fromAccount"
      :label="$t('forms.portfolioTransfer.fromAccountLabel')"
      :values="availableFromAccounts"
      value-key="id"
      label-key="name"
      :placeholder="$t('forms.portfolioTransfer.fromAccountPlaceholder')"
      :disabled="isAnyMutationPending || disabled || props.context === 'account'"
    />

    <SelectField
      v-if="showToPortfolio"
      v-model="form.toPortfolio"
      :label="$t('forms.portfolioTransfer.toPortfolioLabel')"
      :values="availableToPortfolios"
      value-key="id"
      label-key="name"
      :placeholder="$t('forms.portfolioTransfer.toPortfolioPlaceholder')"
      :disabled="isAnyMutationPending || disabled"
    />

    <SelectField
      v-if="showToAccount"
      v-model="form.toAccount"
      :label="$t('forms.portfolioTransfer.toAccountLabel')"
      :values="availableToAccounts"
      value-key="id"
      label-key="name"
      :placeholder="$t('forms.portfolioTransfer.toAccountPlaceholder')"
      :disabled="isAnyMutationPending || disabled"
    />

    <SelectField
      v-if="transferType !== 'account-to-portfolio'"
      v-model="form.selectedCurrency"
      :label="$t('forms.portfolioTransfer.currencyLabel')"
      :values="currencies || []"
      value-key="currencyCode"
      :label-key="(currency: UserCurrencyModel) => currency.currency!.code"
      :placeholder="$t('forms.portfolioTransfer.currencyPlaceholder')"
      :disabled="isAnyMutationPending || disabled"
      :error-message="getFieldErrorMessage('form.selectedCurrency')"
    />

    <InputField
      v-model="form.amount"
      :label="amountLabel"
      type="number"
      step="0.01"
      min="0.01"
      :placeholder="$t('forms.portfolioTransfer.amountPlaceholder')"
      :disabled="isAnyMutationPending || disabled"
      :error="getFieldErrorMessage('form.amount')"
      @blur="touchField('form.amount')"
    />

    <DateField
      v-model="form.date"
      :label="$t('forms.portfolioTransfer.dateLabel')"
      :disabled="isAnyMutationPending || disabled"
      :error-message="getFieldErrorMessage('form.date')"
      @blur="touchField('form.date')"
    />

    <TextareaField
      v-model="form.description"
      :label="$t('forms.portfolioTransfer.descriptionLabel')"
      :placeholder="$t('forms.portfolioTransfer.descriptionPlaceholder')"
      :disabled="isAnyMutationPending || disabled"
    />

    <div class="flex justify-end gap-4">
      <UiButton type="button" variant="secondary" @click="emit('cancel')" :disabled="isAnyMutationPending || disabled">
        {{ $t('forms.portfolioTransfer.cancelButton') }}
      </UiButton>
      <UiButton type="submit" class="min-w-30" :disabled="isSubmitDisabled">
        {{
          isAnyMutationPending
            ? $t('forms.portfolioTransfer.submitButtonLoading')
            : $t('forms.portfolioTransfer.submitButton')
        }}
      </UiButton>
    </div>

    <AlertDialog.AlertDialog v-model:open="showConfirmDialog">
      <AlertDialog.AlertDialogContent>
        <AlertDialog.AlertDialogHeader>
          <AlertDialog.AlertDialogTitle>{{
            $t('forms.portfolioTransfer.confirmDialog.title')
          }}</AlertDialog.AlertDialogTitle>
          <AlertDialog.AlertDialogDescription>
            <i18n-t keypath="forms.portfolioTransfer.confirmDialog.description" tag="span">
              <template #amount>
                <strong>{{ confirmDialogData?.amount }}</strong>
              </template>
              <template #from>
                <strong>{{ confirmDialogData?.from }}</strong>
              </template>
              <template #to>
                <strong>{{ confirmDialogData?.to }}</strong>
              </template>
            </i18n-t>
          </AlertDialog.AlertDialogDescription>
        </AlertDialog.AlertDialogHeader>
        <AlertDialog.AlertDialogFooter>
          <AlertDialog.AlertDialogCancel>{{
            $t('forms.portfolioTransfer.confirmDialog.cancelButton')
          }}</AlertDialog.AlertDialogCancel>
          <AlertDialog.AlertDialogAction variant="default" @click="confirmTransfer">
            {{ $t('forms.portfolioTransfer.confirmDialog.confirmButton') }}
          </AlertDialog.AlertDialogAction>
        </AlertDialog.AlertDialogFooter>
      </AlertDialog.AlertDialogContent>
    </AlertDialog.AlertDialog>
  </form>
</template>
