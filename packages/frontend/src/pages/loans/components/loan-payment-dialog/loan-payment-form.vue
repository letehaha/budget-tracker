<script setup lang="ts">
import { VERBOSE_PAYMENT_TYPES } from '@/common/const';
import { getMaxLoanPayment, isLoanOverpayment } from '@/common/utils/loan-payment';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import FormRow from '@/components/dialogs/manage-transaction/components/form-row.vue';
import { useDeleteTransaction, useSubmitTransaction } from '@/components/dialogs/manage-transaction/composables';
import { useUnlinkLoanPayment } from '@/composable/data-queries/loans';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { FORM_TYPES, type UI_FORM_STRUCT } from '@/components/dialogs/manage-transaction/types';
import type { FormattedCategory } from '@/common/types';
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useFormValidation } from '@/composable/form-validator';
import { useExchangeRates } from '@/composable/data-queries/currencies';
import { useFormatCurrency } from '@/composable/formatters';
import { useAccountsStore, useCategoriesStore, useCurrenciesStore } from '@/stores';
import { ACCOUNT_CATEGORIES, AccountModel, PAYMENT_TYPES, type TransactionModel } from '@bt/shared/types';
import { helpers, minValue, required } from '@vuelidate/validators';
import { HandCoinsIcon, InfoIcon } from '@lucide/vue';
import { DialogClose, DialogTitle } from 'reka-ui';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  /** Destination loan account. Required for both create and edit modes. */
  loanAccount: AccountModel;
  /** Source-side leg in edit mode (the expense transaction on the user's bank account). */
  transaction?: TransactionModel;
  /** Loan-side leg in edit mode (the income transaction on the loan account). */
  oppositeTransaction?: TransactionModel;
}>();

const emit = defineEmits<{ 'close-modal': [] }>();

const { t } = useI18n();
const { txTargetableSourceAccountsActiveFirst, accountsRecord } = storeToRefs(useAccountsStore());
const { currenciesMap } = storeToRefs(useCurrenciesStore());
// Submit/delete composables expect a populated categories map even though
// loan payments are transfers (categoryId stays null on the wire). Pull it so
// `prepopulateForm`-style fallbacks inside `useSubmitTransaction` see a real
// FormattedCategory rather than undefined.
const { formattedCategories } = storeToRefs(useCategoriesStore());

const isEdit = computed(() => Boolean(props.transaction));

const initialSourceAccount = computed<AccountModel | null>(() => {
  if (props.transaction) return accountsRecord.value[props.transaction.accountId] ?? null;
  return txTargetableSourceAccountsActiveFirst.value[0] ?? null;
});

const form = ref<{
  account: AccountModel | null;
  amount: number | null;
  targetAmount: number | null;
  time: Date;
}>({
  account: initialSourceAccount.value,
  amount: props.transaction?.amount ?? null,
  targetAmount: props.oppositeTransaction?.amount ?? null,
  time: props.transaction ? new Date(props.transaction.time) : new Date(),
});

const sourceCurrency = computed(() => {
  const code = form.value.account?.currencyCode;
  return code ? currenciesMap.value[code]?.currency?.code : undefined;
});
const loanCurrency = computed(() => currenciesMap.value[props.loanAccount.currencyCode]?.currency?.code);

const isCurrenciesDifferent = computed(
  () => !!form.value.account && form.value.account.currencyCode !== props.loanAccount.currencyCode,
);

const { convert: convertCurrency, data: exchangeRates } = useExchangeRates();
const { formatAmountByCurrencyCode } = useFormatCurrency();

// Largest payment that keeps the loan at or above zero. In edit mode the
// existing leg is credited back so re-saving the same value isn't an overpay.
const maxLoanPaymentAllowed = computed(() =>
  getMaxLoanPayment({
    loanCurrentBalance: props.loanAccount.currentBalance,
    existingLegAmount: props.oppositeTransaction?.amount ?? 0,
  }),
);

// Soft heads-up: a payment larger than the source account's balance overdraws
// it. Only flag a positive-balance account being driven negative — accounts
// already in the red (credit lines) overdraw by design. Non-blocking; the app
// allows negative balances.
const wouldOverdrawSource = computed(() => {
  const account = form.value.account;
  if (!account) return false;
  const amount = Number(form.value.amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  return account.currentBalance >= 0 && amount > account.currentBalance;
});

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const submitMutation = useSubmitTransaction({ onSuccess: () => emit('close-modal') });
const deleteMutation = useDeleteTransaction({ onSuccess: () => emit('close-modal') });
const unlinkMutation = useUnlinkLoanPayment();

const isLoading = computed(
  () => submitMutation.isPending.value || deleteMutation.isPending.value || unlinkMutation.isPending.value,
);

// `submit` needs a fallback category from the categories store (see the guard
// inside `submit`). Keep the button disabled until the store hydrates so a
// fast click after page load doesn't turn into a silent no-op.
const categoriesReady = computed(() => formattedCategories.value.length > 0);

const validationRules = computed(() => {
  // Match the backend's row-locked overpay guard. The active field depends on
  // currency parity: cross-currency uses the user-entered loan-side amount;
  // same-currency uses Amount directly (no targetAmount field shown).
  const overpayRule = helpers.withMessage(
    () =>
      t('loans.detail.payment.overpayError', {
        max: formatAmountByCurrencyCode(maxLoanPaymentAllowed.value, props.loanAccount.currencyCode),
      }),
    (value: unknown) => {
      if (value == null || value === '') return true;
      return !isLoanOverpayment({ amount: Number(value), maxPayment: maxLoanPaymentAllowed.value });
    },
  );

  return {
    form: {
      account: { required },
      amount: isCurrenciesDifferent.value
        ? { required, minValue: minValue(0.01) }
        : { required, minValue: minValue(0.01), notOverpay: overpayRule },
      targetAmount: isCurrenciesDifferent.value ? { required, minValue: minValue(0.01), notOverpay: overpayRule } : {},
    },
  };
});

const { isFormValid, getFieldErrorMessage, touchField } = useFormValidation(
  { form },
  validationRules,
  {},
  {
    customValidationMessages: {
      required: t('dialogs.manageTransaction.form.validation.required'),
      minValue: t('dialogs.manageTransaction.form.validation.minValue'),
    },
  },
);

const accountErrorMessage = computed(() => getFieldErrorMessage('form.account'));
const amountErrorMessage = computed(() => getFieldErrorMessage('form.amount'));
const targetAmountErrorMessage = computed(() => getFieldErrorMessage('form.targetAmount'));

// Re-fires on every Amount blur so the loan-side hint tracks edits; a user's edit to the loan-side field survives until Amount changes again.
const prefillTargetAmount = () => {
  if (!isCurrenciesDifferent.value) return;
  if (form.value.amount == null) return;
  const sourceCode = form.value.account?.currencyCode;
  if (!sourceCode) return;
  const converted = convertCurrency({
    amount: Number(form.value.amount),
    from: sourceCode,
    to: props.loanAccount.currencyCode,
  });
  if (converted == null) return;
  form.value.targetAmount = converted;
};

const onAmountBlur = () => {
  touchField('form.amount');
  prefillTargetAmount();
};

// The rates query starts with empty placeholder data: a user who fills Amount
// before the rates arrive would get no prefill and never learn why. Re-run the
// prefill once rates land — but only while the loan-side field is still empty,
// so a hand-entered value isn't overwritten.
watch(exchangeRates, () => {
  if (form.value.targetAmount != null) return;
  prefillTargetAmount();
});

// The update params always forward `paymentType`, so in edit mode it must
// reflect the stored value — a fixed default would silently rewrite whatever
// the payment had. `creditCard` is only the fallback for brand-new payments.
const paymentType = computed(
  () =>
    VERBOSE_PAYMENT_TYPES.find((item) => item.value === (props.transaction?.paymentType ?? PAYMENT_TYPES.creditCard)) ??
    null,
);

const buildFormStruct = ({ fallbackCategory }: { fallbackCategory: FormattedCategory }): UI_FORM_STRUCT => ({
  type: FORM_TYPES.transfer,
  amount: Number(form.value.amount),
  account: form.value.account!,
  toAccount: props.loanAccount,
  toPortfolio: null,
  targetAmount: isCurrenciesDifferent.value ? Number(form.value.targetAmount) : Number(form.value.amount),
  category: fallbackCategory,
  time: form.value.time,
  paymentType: paymentType.value,
  note: undefined,
  refundedByTxs: undefined,
  refundsTx: undefined,
  tagIds: [],
  payeeId: null,
  categoryUserTouched: false,
});

const submit = () => {
  touchField('form.account');
  touchField('form.amount');
  touchField('form.targetAmount');
  if (!isFormValid('form')) return;

  // Transfers persist with `categoryId: null` — the struct's category only
  // satisfies UI_FORM_STRUCT's non-nullable type, the transfer branch of the
  // submit params never reads it. The guard keeps an unhydrated categories
  // store from smuggling `undefined` through that type.
  const fallbackCategory = formattedCategories.value[0];
  if (!fallbackCategory) return;

  submitMutation.mutate({
    form: buildFormStruct({ fallbackCategory }),
    isFormCreation: !isEdit.value,
    isTransferTx: true,
    isCurrenciesDifferent: isCurrenciesDifferent.value,
    isOriginalRefundsOverriden: false,
    isRecordExternal: false,
    transaction: props.transaction,
    oppositeTransaction: props.oppositeTransaction,
    linkedTransaction: null,
  });
};

const isDeleteConfirmOpen = ref(false);
const isUnlinkConfirmOpen = ref(false);

const deletePayment = () => {
  if (!props.transaction) return;
  deleteMutation.mutate({ transactionId: props.transaction.id });
};

const unlinkPayment = () => {
  if (!props.transaction) return;
  unlinkMutation.mutate(
    { id: props.loanAccount.id, transactionId: props.transaction.id },
    {
      onSuccess: () => {
        addSuccessNotification(t('loans.detail.payment.unlinkSuccess'));
        emit('close-modal');
      },
      onError: (error) => {
        if (error instanceof ApiErrorResponseError) {
          addErrorNotification(error.data.message ?? error.message);
        } else {
          addErrorNotification(t('loans.detail.payment.unlinkError'));
        }
      },
    },
  );
};
</script>

<template>
  <div class="rounded-t-xl">
    <div class="bg-app-transfer-color h-3 rounded-t-lg" />
    <div class="mb-4 flex items-center justify-between px-6 py-3">
      <DialogTitle>
        <span class="text-2xl">
          {{ isEdit ? $t('loans.detail.payment.editTitle') : $t('loans.detail.payment.createTitle') }}
        </span>
      </DialogTitle>
      <DialogClose as-child>
        <Button variant="ghost">{{ $t('dialogs.manageTransaction.form.closeButton') }}</Button>
      </DialogClose>
    </div>

    <div class="space-y-1 px-6 pb-6">
      <div class="bg-muted/40 mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5">
        <HandCoinsIcon class="text-app-transfer-color size-4 shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="text-muted-foreground text-xs">{{ $t('loans.detail.payment.payingTo') }}</div>
          <div class="truncate text-sm font-medium">{{ loanAccount.name }}</div>
        </div>
        <div class="text-muted-foreground shrink-0 text-xs">{{ loanCurrency }}</div>
      </div>

      <FormRow>
        <SelectField
          v-model="form.account"
          :label="$t('loans.detail.payment.fromAccountLabel')"
          :values="txTargetableSourceAccountsActiveFirst"
          value-key="id"
          label-key="name"
          :placeholder="$t('loans.detail.payment.fromAccountPlaceholder')"
          :disabled="isLoading"
          :error-message="accountErrorMessage"
        />
      </FormRow>

      <FormRow>
        <InputField
          v-model="form.amount"
          :label="$t('loans.detail.payment.amountLabel')"
          type="number"
          only-positive
          :placeholder="$t('loans.detail.payment.amountPlaceholder')"
          :disabled="isLoading"
          :error-message="amountErrorMessage"
          @blur="onAmountBlur"
        >
          <template #iconTrailing>
            <span>{{ sourceCurrency }}</span>
          </template>
        </InputField>
      </FormRow>

      <p v-if="wouldOverdrawSource" class="text-warning-text -mt-1 px-1 text-xs">
        {{ $t('loans.detail.payment.overdrawWarning', { account: form.account?.name ?? '' }) }}
      </p>

      <FormRow v-if="isCurrenciesDifferent">
        <InputField
          v-model="form.targetAmount"
          :label="$t('loans.detail.payment.targetAmountLabel')"
          type="number"
          only-positive
          :placeholder="$t('loans.detail.payment.targetAmountPlaceholder')"
          :disabled="isLoading"
          :error-message="targetAmountErrorMessage"
          @blur="touchField('form.targetAmount')"
        >
          <template #label-after>
            <DesktopOnlyTooltip
              :content="
                $t('loans.detail.payment.targetAmountTooltip', {
                  source: sourceCurrency ?? '',
                  loan: loanCurrency ?? '',
                })
              "
              side="top"
            >
              <InfoIcon class="text-muted-foreground size-3.5 cursor-help" />
            </DesktopOnlyTooltip>
          </template>
          <template #iconTrailing>
            <span>{{ loanCurrency }}</span>
          </template>
        </InputField>
      </FormRow>

      <FormRow>
        <DateField
          v-model="form.time"
          :label="$t('dialogs.manageTransaction.form.datetimeLabel')"
          :disabled="isLoading"
          :calendar-options="{ maxDate: new Date() }"
        />
      </FormRow>

      <div class="flex items-center justify-between pt-6">
        <div v-if="isEdit" class="flex gap-2">
          <Button class="min-w-25" variant="destructive" :disabled="isLoading" @click="isDeleteConfirmOpen = true">
            {{ $t('dialogs.manageTransaction.form.deleteButton') }}
          </Button>
          <Button class="min-w-25" variant="destructive" :disabled="isLoading" @click="isUnlinkConfirmOpen = true">
            {{ $t('loans.detail.payment.unlinkButton') }}
          </Button>
        </div>
        <Button class="ml-auto min-w-30" :disabled="isLoading || !categoriesReady" @click="submit">
          {{
            isLoading
              ? $t('dialogs.manageTransaction.form.loadingButton')
              : isEdit
                ? $t('loans.detail.payment.saveButton')
                : $t('loans.detail.payment.recordButton')
          }}
        </Button>
      </div>
    </div>

    <ResponsiveAlertDialog
      v-model:open="isDeleteConfirmOpen"
      :confirm-label="$t('dialogs.manageTransaction.form.deleteButton')"
      confirm-variant="destructive"
      :confirm-disabled="isLoading"
      @confirm="deletePayment"
    >
      <template #title>{{ $t('loans.detail.payment.deleteConfirmTitle') }}</template>
      <template #description>{{ $t('loans.detail.payment.deleteConfirmDescription') }}</template>
    </ResponsiveAlertDialog>

    <ResponsiveAlertDialog
      v-model:open="isUnlinkConfirmOpen"
      :confirm-label="$t('loans.detail.payment.unlinkButton')"
      confirm-variant="destructive"
      :confirm-disabled="isLoading"
      @confirm="unlinkPayment"
    >
      <template #title>{{ $t('loans.detail.payment.unlinkConfirmTitle') }}</template>
      <template #description>{{ $t('loans.detail.payment.unlinkConfirmDescription') }}</template>
    </ResponsiveAlertDialog>
  </div>
</template>
