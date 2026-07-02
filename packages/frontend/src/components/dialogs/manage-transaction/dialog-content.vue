<script lang="ts" setup>
import { loadTransactionById } from '@/api/transactions';
import { OUT_OF_WALLET_ACCOUNT_MOCK, VERBOSE_PAYMENT_TYPES } from '@/common/const';
import { getMaxLoanPayment, isLoanOverpayment } from '@/common/utils/loan-payment';
import { findFormattedCategoryById } from '@/stores/categories/helpers';
import { captureException } from '@/lib/sentry';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import PayeeSelectField from '@/components/fields/payee-select-field.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import TagSelectField from '@/components/fields/tag-select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import { Button } from '@/components/lib/ui/button';
import * as Drawer from '@/components/lib/ui/drawer';
import { useExchangeRates } from '@/composable/data-queries/currencies';
import { useFormValidation } from '@/composable/form-validator';
import { useFormatCurrency } from '@/composable/formatters';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { formatUIAmount } from '@/js/helpers';
import { useAccountsStore, useCategoriesStore, useCurrenciesStore, useTagsStore, useUserStore } from '@/stores';
import {
  isTwoLegTransfer,
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  type TransactionModel,
} from '@bt/shared/types';
import { format } from 'date-fns';
import { helpers, minValue, required } from '@vuelidate/validators';
import { createReusableTemplate, watchOnce } from '@vueuse/core';
import { SplitIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { DialogClose, DialogTitle } from 'reka-ui';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import AccountField from './components/account-field.vue';
import FormRow from './components/form-row.vue';
import LinkTransactionSection from './components/link-transaction-section.vue';
import PortfolioLinkedView from './components/portfolio-linked-view.vue';
import VehicleLinkedView from './components/vehicle-linked-view.vue';
import VentureLinkedView from './components/venture-linked-view.vue';
import MarkAsRefundField from './components/mark-as-refund/mark-as-refund-field.vue';
import SplitDialog from './components/split-dialog.vue';
import TypeSelector from './components/type-selector.vue';
import { useAccountAccess } from '@/composable/use-account-access';
import { useAccountCategories } from '@/composable/data-queries/categories';
import { useLoans } from '@/composable/data-queries/loans';
import { usePortfolios } from '@/composable/data-queries/portfolios';

import {
  getRefundInfo,
  useDeleteTransaction,
  useSubmitTransaction,
  useTransferFormLogic,
  useUnlinkTransactions,
} from './composables';
import type { TransferDestinationType } from './composables/transfer-form';
import { usePayeeTagAutoApply } from '@/composable/use-payee-tag-auto-apply';

import { canDeleteTransaction, prepopulateForm } from './helpers';
import { FORM_TYPES, UI_FORM_STRUCT } from './types';

defineOptions({
  name: 'record-form',
});

interface CreateRecordModalProps {
  transaction?: TransactionModel;
  oppositeTransaction?: TransactionModel;
}

const props = withDefaults(defineProps<CreateRecordModalProps>(), {
  transaction: undefined,
  oppositeTransaction: undefined,
});

// Keep `transaction` as the user-facing primary tx (set by useManageTransactionDialog
// – for external transfers, this is always the external side). Form-data mapping
// (which side is "from"/"to") is handled in prepopulateForm based on transactionType,
// so we no longer swap the props.
const transaction = computed(() => props.transaction);
const oppositeTransaction = computed(() => props.oppositeTransaction);

const emit = defineEmits(['close-modal']);
const closeModal = () => {
  emit('close-modal');
};

const isPortfolioLinkedView = computed(
  () => !!props.transaction && props.transaction.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
);

const isVentureLinkedView = computed(
  () => !!props.transaction && props.transaction.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_venture,
);

const route = useRoute();
const { t } = useI18n();
watch(() => route.path, closeModal);

const { currenciesMap } = storeToRefs(useCurrenciesStore());
const { accountsRecord, txTargetableAccountsActiveFirst, txTargetableSourceAccountsActiveFirst } =
  storeToRefs(useAccountsStore());

// Vehicle balance-adjustments are reused `transfer_out_wallet` rows on a
// vehicle-category account. Editing them in this generic dialog would let the
// user desync amount/date from Vehicle.valueAnchor (which the override service
// keeps in sync). Lock the form and bounce them to the vehicle detail page.
const isVehicleLinkedView = computed(() => {
  if (!props.transaction) return false;
  if (props.transaction.transferNature !== TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) return false;
  const account = accountsRecord.value[props.transaction.accountId];
  return account?.accountCategory === ACCOUNT_CATEGORIES.vehicle;
});
const { formattedCategories, categoriesMap } = storeToRefs(useCategoriesStore());
const { user: currentUser } = storeToRefs(useUserStore());
const tagsStore = useTagsStore();
// Load tags when the dialog opens
tagsStore.loadTags();

const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const isFormCreation = computed(() => !props.transaction);

const form = ref<UI_FORM_STRUCT>({
  amount: null,
  account: null,
  toAccount: null,
  toPortfolio: null,
  targetAmount: null,
  category: formattedCategories.value[0]!,
  time: new Date(),
  paymentType: VERBOSE_PAYMENT_TYPES.find((item) => item.value === PAYMENT_TYPES.creditCard) ?? null,
  note: undefined,
  type: FORM_TYPES.expense,
  refundedByTxs: undefined,
  refundsTx: undefined,
  tagIds: [],
  payeeId: null,
  categoryUserTouched: false,
});

// PayeeField → category auto-fill (one-shot) + tag auto-apply.
// The form is unaware whether the category was set by the user or by Payee
// auto-fill; mark `categoryUserTouched` whenever the user opens the picker so
// later Payee selections respect their intent. The Payee's explicit default
// wins; the top (most-used) category is a fallback so users who never set
// defaults still get a useful suggestion.
//
// Tags use a different model – see `usePayeeTagAutoApply`. In edit mode its
// tracker starts empty, so the row's saved tags count as manual: a payee
// change only adds, never removes. Prepopulation sets `payeeId` without going
// through the clear path, which is consistent with that empty tracker.
const formTagIds = computed({
  get: () => form.value.tagIds ?? [],
  set: (value: string[]) => {
    form.value.tagIds = value;
  },
});
const { onPayeeSelected: applyPayeeTags } = usePayeeTagAutoApply({
  tagIds: formTagIds,
  payeeId: () => form.value.payeeId,
});
const handlePayeeSelected = ({
  defaultCategoryId,
  topCategoryId,
  defaultTagIds,
}: {
  payeeId: string;
  defaultCategoryId: string | null;
  topCategoryId: string | null;
  defaultTagIds: string[];
}) => {
  applyPayeeTags({ defaultTagIds });

  if (form.value.categoryUserTouched) return;
  const targetId = defaultCategoryId ?? topCategoryId;
  if (!targetId) return;
  const match = findFormattedCategoryById(effectiveFormattedCategories.value, targetId);
  if (match) form.value.category = match;
};
const handleCategoryUserTouched = () => {
  form.value.categoryUserTouched = true;
};

const transferDestinationType = ref<TransferDestinationType>('account');

const { data: portfolios } = usePortfolios();

const {
  isInitialRefundsDataLoaded,
  initialRefundsFormSlice,
  originalRefunds,
  isOriginalRefundsOverriden,
  refundTransactionsTypeBasedOnFormType,
} = getRefundInfo({
  initialTransaction: props.transaction,
  form,
});

watchOnce(
  initialRefundsFormSlice,
  (value) => {
    form.value = Object.assign(form.value, value);
  },
  { deep: true },
);

const linkedTransaction = ref<TransactionModel | null>(null);

// Split dialog state
const isSplitDialogOpen = ref(false);

const hasSplits = computed(() => form.value.splits && form.value.splits.length > 0);
const splitsTotal = computed(() => {
  if (!form.value.splits) return 0;
  return form.value.splits.reduce((sum, split) => sum + (split.amount ?? 0), 0);
});

const isRecordExternal = computed(() => {
  if (!transaction.value) return false;
  // Check the account type, not the transaction type
  // A system transaction in a monobank account should be treated as external
  const account = accountsRecord.value[transaction.value.accountId];
  return (account && account.type !== ACCOUNT_TYPES.system) ?? false;
});
const isOppositeTxExternal = computed(() => {
  if (!oppositeTransaction.value) return false;
  // Check the account type, not the transaction type
  // A system transaction in a monobank account should be treated as external
  const account = accountsRecord.value[oppositeTransaction.value.accountId];
  return (account && account.type !== ACCOUNT_TYPES.system) ?? false;
});
// If record is external (and not a transfer), the account field will be disabled,
// so we need to preselect the account. For transfer cases, prepopulateForm fills
// form.account based on which side is the source – bypassing this preselection.
watch(
  () => isRecordExternal.value,
  (value) => {
    if (!value) return;
    if (transaction.value?.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) return;
    if (isTwoLegTransfer(transaction.value?.transferNature)) return;

    nextTick(() => {
      if (transaction.value && accountsRecord.value[transaction.value.accountId]) {
        form.value.account = accountsRecord.value[transaction.value.accountId]!;
      }
    });
  },
  { immediate: true },
);

const submitMutation = useSubmitTransaction({ onSuccess: closeModal });
const unlinkMutation = useUnlinkTransactions({ onSuccess: closeModal });
const deleteMutation = useDeleteTransaction({ onSuccess: closeModal });

const isLoading = computed(
  () => submitMutation.isPending.value || unlinkMutation.isPending.value || deleteMutation.isPending.value,
);

// Resolve the account whose share state drives auth + category routing. In edit mode
// it's the tx's parent account (immutable in this dialog); in create mode it's whatever
// the user has currently picked in the account-field.
const resolvedAccountId = computed(() => {
  if (transaction.value) return transaction.value.accountId;
  return form.value.account?.id ?? null;
});
const resolvedAccount = computed(() =>
  resolvedAccountId.value != null ? accountsRecord.value[resolvedAccountId.value] : undefined,
);
const {
  share: accountShare,
  isSharedWithCaller: isAccountSharedWithCaller,
  canMutateTx,
} = useAccountAccess(resolvedAccount);

const sharedAccountCategories = useAccountCategories({
  accountId: () => resolvedAccountId.value ?? undefined,
  enabled: isAccountSharedWithCaller,
});

const effectiveFormattedCategories = computed(() =>
  isAccountSharedWithCaller.value ? sharedAccountCategories.formatted.value : formattedCategories.value,
);
const effectiveCategoriesMap = computed(() =>
  isAccountSharedWithCaller.value ? sharedAccountCategories.map.value : categoriesMap.value,
);

// Treat both success and error as terminal so a failed fetch unblocks the form (the
// composable surfaces the error via toast). Without the `isError` branch, prepopulation
// would hang and the dialog would render a permanently-blank edit form on transient
// network failures.
const isCategoriesReady = computed(
  () =>
    !isAccountSharedWithCaller.value ||
    sharedAccountCategories.isSuccess.value ||
    sharedAccountCategories.isError.value,
);

const canMutateCurrentTx = computed(() => canMutateTx(transaction.value, currentUser.value?.id));

// Lazy server-side write-access check, used only when the parent account isn't in the
// caller's local `accountsRecord` – typically when the row is visible via a budget
// share but the account itself isn't shared with the caller. `useAccountAccess` can't
// decide that case (it has nothing to read), and the bulk list path intentionally
// skips `canEdit` to keep common reads cheap. Returns `null` until resolved.
const isAccountLocallyKnown = computed(() => {
  if (!transaction.value) return true;
  return !!accountsRecord.value[transaction.value.accountId];
});
const lazyCanEdit = ref<boolean | null>(null);
watch(
  transaction,
  async (tx) => {
    lazyCanEdit.value = null;
    if (!tx) return;
    if (isAccountLocallyKnown.value) return;
    try {
      const detail = await loadTransactionById({ id: tx.id });
      // Pessimistic default: only unlock the form when the server explicitly says
      // `canEdit: true`. A null detail (caller had no read claim) or a missing field
      // both fall through to read-only – submitting under uncertainty would 403.
      lazyCanEdit.value = detail?.canEdit === true;
    } catch (error) {
      // Form degrades to read-only on failure – the visible state change tells the
      // user the form is locked. Sentry capture surfaces transient failures (auth
      // expiry, server crash, network drop) so ops can distinguish them from a real
      // permission denial. A toast would be noisy on flaky networks.
      lazyCanEdit.value = false;
      captureException({ error, context: { source: 'lazyCanEditProbe', transactionId: tx.id } });
    }
  },
  { immediate: true },
);

// Read-only when the row is editable in principle (some claim) but the lazy check has
// either resolved to "no write" or is still in flight. While loading, we prefer the
// pessimistic "details" view so the user doesn't see an edit button flicker, then
// disappear. For account-locally-known txs we trust the synchronous local check.
const isReadOnly = computed(() => {
  if (!transaction.value) return false;
  if (isAccountLocallyKnown.value) return false;
  if (lazyCanEdit.value === null) return true;
  return !lazyCanEdit.value;
});
const isMutable = computed(() => canMutateCurrentTx.value && !isReadOnly.value);

const isFormFieldsDisabled = computed(() => isLoading.value || !isInitialRefundsDataLoaded.value || !isMutable.value);

const currentTxType = computed(() => form.value.type);
const isTransferTx = computed(() => currentTxType.value === FORM_TYPES.transfer);

// The Loan pill only narrows the picker to loan accounts; the backend stamps transfer_to_loan from the destination's accountCategory.
const isLoanDestination = computed(() => isTransferTx.value && transferDestinationType.value === 'loan');

const loanDestinationAccounts = computed(() =>
  txTargetableAccountsActiveFirst.value.filter((item) => item.accountCategory === ACCOUNT_CATEGORIES.loan),
);

// Transfer kind is frozen on a live pair (backend rejects relabeling) – switching
// the pill mid-edit would 422. Lock it; unlink the transfer first to change destination type.
const isDestinationTypeLocked = computed(() => isTwoLegTransfer(transaction.value?.transferNature));

const {
  isTargetFieldVisible,
  isTargetAmountFieldDisabled,
  targetCurrency,
  fromAccountFieldDisabled,
  toAccountFieldDisabled,
  transferSourceAccounts,
  transferDestinationAccounts,
} = useTransferFormLogic({
  form,
  isTransferTx,
  isRecordExternal,
  isOppositeTxExternal,
  transaction: transaction.value,
  oppositeTransaction: oppositeTransaction.value,
  linkedTransaction,
  transferDestinationType,
});

// TODO:
// 1. Tx creation, validate that refAmount is less than refund refAmount. Use useFormValidation for
// that
// 2. When tx is opened, fetch refund, if there's any. For refund keep "Refund of", for base
// call it "Refunded by"
// 3. When editing, validate refAmount in the same way

const isAmountFieldDisabled = computed(() => {
  if (isRecordExternal.value) {
    if (!isTransferTx.value) return true;
    if (transaction.value?.transactionType === TRANSACTION_TYPES.expense) {
      return true;
    }
  }
  // Means it's "Out of wallet"
  if (form.value.account?.id === OUT_OF_WALLET_ACCOUNT_MOCK.id) return true;
  if (isTransferTx.value && linkedTransaction.value) return true;
  return false;
});

const isCurrenciesDifferent = computed(() => {
  if (!form.value.account || !form.value.toAccount) return false;

  return form.value.account.currencyCode !== form.value.toAccount.currencyCode;
});

const currencyCode = computed(() => {
  const accountCurrencyCode = form.value.account?.currencyCode;
  if (accountCurrencyCode) {
    return currenciesMap.value[accountCurrencyCode]?.currency?.code;
  }
  return undefined;
});

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { convert: convertCurrency, data: exchangeRates } = useExchangeRates();

// --- Transfer → Loan payment guards ---

// Credit already reflected in the loan's balance for THIS specific payment –
// mirrors the backend's `currentLegAmount`/`isSameDestination` pair in
// `updateTransaction`: a leg only counts when it already landed as an income
// row on the currently-selected loan account. Re-pointing to a different loan,
// or promoting a plain (never-transferred) transaction into a loan payment,
// starts from zero credit, since no prior write touched that account's
// balance. Naturally 0 in creation mode too (`transaction`/`oppositeTransaction`
// are both undefined there).
const existingLoanLegAmount = computed(() => {
  const loanAccountId = form.value.toAccount?.id;
  if (!loanAccountId) return 0;
  const existingLeg = [transaction.value, oppositeTransaction.value].find(
    (tx) => tx?.transactionType === TRANSACTION_TYPES.income && tx.accountId === loanAccountId,
  );
  return existingLeg?.amount ?? 0;
});

// Largest payment that keeps the destination loan at or above zero.
const loanOverpayMax = computed(() =>
  getMaxLoanPayment({
    loanCurrentBalance: form.value.toAccount?.currentBalance ?? 0,
    existingLegAmount: existingLoanLegAmount.value,
  }),
);

// Inline overpay guard, mirroring the dedicated payment dialog so the user
// sees the exact remaining balance inline instead of a figureless toast after
// submit. Active for both creation and edits (e.g. promoting an existing
// transaction into a loan payment via the type/destination pickers) –
// `existingLoanLegAmount` above keeps the threshold aligned with the
// backend's row-locked guard in either case.
const isLoanOverpayCheckActive = computed(() => isLoanDestination.value && !!form.value.toAccount);

// Soft warning when a loan payment would overdraw the source. Only flags a positive
// balance going negative – credit lines already in the red overdraw by design. Non-blocking.
const wouldOverdrawLoanSource = computed(() => {
  if (!isLoanDestination.value) return false;
  const account = form.value.account;
  if (!account) return false;
  const amount = Number(form.value.amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  return account.currentBalance >= 0 && amount > account.currentBalance;
});

// Reuses the Loans page's TanStack Query cache – no extra request fires when the dialog opens.
const { data: loansData } = useLoans();

// Hint: tx date is before the loan's balance anchor date, so this payment is already
// baked into the opening snapshot and won't adjust the outstanding balance.
const isPreAnchorLoanPayment = computed(() => {
  if (!isLoanDestination.value) return false;
  const toAccountId = form.value.toAccount?.id;
  if (!toAccountId) return false;
  const loan = loansData.value?.find((l) => l.id === toAccountId);
  const anchorDate = loan?.loanDetails.balanceAnchorDate;
  if (!anchorDate) return false;
  // yyyy-MM-dd lexicographic compare is correct for ISO date strings.
  const txDate = format(form.value.time, 'yyyy-MM-dd');
  return txDate < anchorDate;
});

// Pre-fills the loan-currency target from the live rate so cross-currency payments
// default to the converted amount. Reruns on each Amount blur; a hand-typed value survives.
const prefillLoanTargetAmount = () => {
  if (!isLoanDestination.value || !isCurrenciesDifferent.value) return;
  if (form.value.amount == null) return;
  const sourceCode = form.value.account?.currencyCode;
  const loanCode = form.value.toAccount?.currencyCode;
  if (!sourceCode || !loanCode) return;
  const converted = convertCurrency({ amount: Number(form.value.amount), from: sourceCode, to: loanCode });
  if (converted == null) return;
  form.value.targetAmount = converted;
};

watch(transferDestinationType, (type, prev) => {
  if (type === 'portfolio') {
    form.value.toAccount = null;
    return;
  }
  // Auto-pick first loan on switch to 'loan' unless already selected (edit prepop runs first).
  // Clear toAccount on exit so a loan selection doesn't leak into the account picker.
  form.value.toPortfolio = null;
  if (type === 'loan' && prev !== 'loan') {
    if (form.value.toAccount?.accountCategory !== ACCOUNT_CATEGORIES.loan) {
      form.value.toAccount = loanDestinationAccounts.value[0] ?? null;
    }
  } else if (prev === 'loan' && type !== 'loan') {
    form.value.toAccount = null;
  }
});

watch(
  () => [currentTxType.value, linkedTransaction.value],
  ([txType, isLinked], [prevTxType]) => {
    if (txType !== FORM_TYPES.transfer) {
      transferDestinationType.value = 'account';
      form.value.toPortfolio = null;
    }
    if (transaction.value) {
      // If it's a transaction coming from props it means user currectly edits the form.
      // When switching between transfer type and others we need to keep consistent fields
      // fulfillment
      const { amount, transactionType, accountId, transferNature } = transaction.value;

      if (isLinked) {
        form.value.amount = amount;
        form.value.account = accountsRecord.value[accountId] ?? null;
      } else if (txType === FORM_TYPES.transfer) {
        if (transactionType === TRANSACTION_TYPES.income) {
          form.value.targetAmount = amount;
          form.value.amount = null;

          form.value.toAccount = accountsRecord.value[accountId] ?? null;
          form.value.account = null;

          if (transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) {
            form.value.account = OUT_OF_WALLET_ACCOUNT_MOCK;
          } else if (oppositeTransaction.value) {
            // Restore the source (expense) side from the opposite transaction so the
            // form keeps the previously known source values (e.g. when re-entering
            // transfer mode after toggling income → transfer for an external income tx).
            form.value.amount = oppositeTransaction.value.amount;
            form.value.account = accountsRecord.value[oppositeTransaction.value.accountId] ?? null;
          }
        }
      } else if (prevTxType === FORM_TYPES.transfer) {
        if (transactionType === TRANSACTION_TYPES.income) {
          form.value.amount = amount;
          form.value.targetAmount = null;

          form.value.account = accountsRecord.value[accountId] ?? null;
          form.value.toAccount = null;
        }
      }
    }
  },
);

// In transfer mode, when source and destination accounts share the same currency,
// mirror the missing side from the populated one. Covers the income → transfer
// edit flow where `amount` starts empty after the user picks a source account.
watch(
  () => [form.value.account?.currencyCode, form.value.toAccount?.currencyCode] as const,
  ([fromCurrency, toCurrency]) => {
    if (!isTransferTx.value) return;
    if (!fromCurrency || !toCurrency) return;
    if (fromCurrency !== toCurrency) return;

    if (form.value.amount == null && form.value.targetAmount != null) {
      form.value.amount = form.value.targetAmount;
    } else if (form.value.targetAmount == null && form.value.amount != null) {
      form.value.targetAmount = form.value.amount;
    }
  },
);

const isAmountRequired = computed(() => !isAmountFieldDisabled.value);
const isTargetAmountRequired = computed(
  () =>
    isTargetFieldVisible.value &&
    !isTargetAmountFieldDisabled.value &&
    // When currencies match, the watcher above mirrors the missing side, so requiring
    // both would surface a redundant error before the mirror has a chance to run.
    isCurrenciesDifferent.value,
);

// Wrap the entire structure in one computed so the rules lookup inside
// `getFieldErrorMessage` (which uses lodash get on the original rules object)
// resolves through `rules.value.form.amount` instead of failing on a nested
// ComputedRef and silently dropping the error message.
const validationRules = computed(() => {
  // Cross-currency loan payments validate targetAmount; same-currency ones validate Amount directly.
  const loanOverpayRule = helpers.withMessage(
    () =>
      t('loans.detail.payment.overpayError', {
        max: formatAmountByCurrencyCode(loanOverpayMax.value, form.value.toAccount?.currencyCode ?? ''),
      }),
    (value: unknown) => {
      if (value == null || value === '') return true;
      return !isLoanOverpayment({ amount: Number(value), maxPayment: loanOverpayMax.value });
    },
  );
  const overpayOnAmount = isLoanOverpayCheckActive.value && !isCurrenciesDifferent.value;
  const overpayOnTarget = isLoanOverpayCheckActive.value && isCurrenciesDifferent.value;

  return {
    form: {
      amount: {
        ...(isAmountRequired.value ? { required, minValue: minValue(0.01) } : {}),
        ...(overpayOnAmount ? { notOverpay: loanOverpayRule } : {}),
      },
      targetAmount: {
        ...(isTargetAmountRequired.value ? { required, minValue: minValue(0.01) } : {}),
        ...(overpayOnTarget ? { notOverpay: loanOverpayRule } : {}),
      },
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

const amountErrorMessage = computed(() => getFieldErrorMessage('form.amount'));
const targetAmountErrorMessage = computed(() => getFieldErrorMessage('form.targetAmount'));

const onAmountBlur = () => {
  touchField('form.amount');
  prefillLoanTargetAmount();
};

// Rates load async – fill the loan target once they arrive, but only if still empty so a manual entry isn't clobbered.
watch(exchangeRates, () => {
  if (form.value.targetAmount != null) return;
  prefillLoanTargetAmount();
});

const submit = () => {
  touchField('form.amount');
  touchField('form.targetAmount');

  if (!isFormValid('form')) return;

  submitMutation.mutate({
    form: form.value,
    isFormCreation: isFormCreation.value,
    isTransferTx: isTransferTx.value,
    isCurrenciesDifferent: isCurrenciesDifferent.value,
    isOriginalRefundsOverriden: isOriginalRefundsOverriden.value,
    isRecordExternal: isRecordExternal.value,
    transaction: transaction.value,
    linkedTransaction: linkedTransaction.value,
    oppositeTransaction: oppositeTransaction.value,
  });
};

const unlinkTransactions = () => {
  if (!transaction.value) return;
  unlinkMutation.mutate({
    transferIds: [transaction.value.transferId],
    transactionId: transaction.value.id,
    oppositeTransactionId: oppositeTransaction.value?.id,
  });
};

const canDelete = computed(() =>
  canDeleteTransaction({
    transaction: transaction.value,
    oppositeTransaction: oppositeTransaction.value,
    accounts: accountsRecord.value,
    canMutate: isMutable.value,
  }),
);

const deleteTransactionHandler = () => {
  if (!canDelete.value) return;
  deleteMutation.mutate({
    transactionId: transaction.value!.id,
  });
};

const selectTransactionType = (type: FORM_TYPES, disabled = false) => {
  if (!disabled) form.value.type = type;
};

// Stores element that was focused before modal was opened, to then focus it back
// when modal will be closed
const previouslyFocusedElement = ref(document.activeElement);

const [DefineMoreOptions, ReuseMoreOptions] = createReusableTemplate();

// Tx prepopulation has to wait for the right category map. For owner-side / unshared txs
// the global Pinia map is loaded synchronously on app boot; for shared-with-caller txs
// we route through `useAccountCategories`, which fires after mount – populate then.
const hasPrepopulated = ref(false);
const prepopulateIfReady = () => {
  if (hasPrepopulated.value) return;
  if (!transaction.value) {
    form.value.account = txTargetableSourceAccountsActiveFirst.value[0] ?? null;
    hasPrepopulated.value = true;
    return;
  }
  if (!isCategoriesReady.value) return;
  const data = prepopulateForm({
    transaction: transaction.value,
    oppositeTransaction: oppositeTransaction.value,
    accounts: accountsRecord.value,
    categories: effectiveCategoriesMap.value,
    formattedCategories: effectiveFormattedCategories.value,
  });
  if (data) form.value = data;
  // Edit fallback: when the resolved opposite leg is a loan account, switch the picker to the Loan pill so it matches the row.
  if (data?.toAccount?.accountCategory === ACCOUNT_CATEGORIES.loan) {
    transferDestinationType.value = 'loan';
  }
  hasPrepopulated.value = true;
};

onMounted(prepopulateIfReady);
watch(isCategoriesReady, prepopulateIfReady);

// In create mode, switching between own and shared accounts swaps the category set –
// drop a stale selection so the user doesn't submit a categoryId that no longer exists
// in the active list. Skip while the new list is still loading (empty) – we'd otherwise
// blank the field momentarily.
watch(effectiveFormattedCategories, (categories) => {
  if (!isFormCreation.value) return;
  const selectedId = form.value.category?.id;
  if (selectedId == null) return;
  if (effectiveCategoriesMap.value[selectedId]) return;
  const fallback = categories[0];
  if (fallback) form.value.category = fallback;
});

onUnmounted(() => {
  (previouslyFocusedElement.value as HTMLElement).focus();
});
</script>

<template>
  <!-- Define reusable template for "More Options" section (payment type, note, refund) -->
  <DefineMoreOptions>
    <FormRow v-if="!isLoanDestination">
      <SelectField
        v-model="form.paymentType"
        :label="$t('dialogs.manageTransaction.form.paymentTypeLabel')"
        :disabled="isFormFieldsDisabled || isRecordExternal"
        :values="VERBOSE_PAYMENT_TYPES"
        :label-key="(item) => t(item.label)"
        is-value-preselected
      />
    </FormRow>
    <FormRow>
      <TextareaField
        v-model="form.note"
        :placeholder="$t('dialogs.manageTransaction.form.notePlaceholder')"
        :disabled="isFormFieldsDisabled"
        :label="$t('dialogs.manageTransaction.form.noteLabel')"
      />
    </FormRow>
    <FormRow v-if="!isLoanDestination">
      <TagSelectField
        v-model="form.tagIds"
        :label="$t('dialogs.manageTransaction.form.tagsLabel')"
        :disabled="isFormFieldsDisabled"
      />
    </FormRow>
    <!-- Refund linking on accounts shared *with* the caller isn't supported by the
         backend yet – hide the field rather than offering a button that errors on
         submit. Owner-side shares (`share.isOwner === true`) keep full access. -->
    <template v-if="!isTransferTx && !isAccountSharedWithCaller">
      <FormRow>
        <MarkAsRefundField
          v-model:refunds="form.refundsTx"
          v-model:refunded-by="form.refundedByTxs"
          :transaction-id="transaction?.id"
          :is-record-creation="isFormCreation"
          :transaction-type="refundTransactionsTypeBasedOnFormType"
          :disabled="isFormFieldsDisabled"
          :is-there-original-refunds="Boolean(originalRefunds.length)"
          :current-transaction-splits="transaction?.splits"
          :current-amount="form.amount ? Number(form.amount) : null"
          :current-currency-code="form.account?.currencyCode"
          :current-account-id="form.account?.id"
        />
      </FormRow>
    </template>
  </DefineMoreOptions>

  <PortfolioLinkedView v-if="isPortfolioLinkedView" :transaction="$props.transaction!" @close-modal="closeModal" />
  <VentureLinkedView v-else-if="isVentureLinkedView" :transaction="$props.transaction!" @close-modal="closeModal" />
  <VehicleLinkedView v-else-if="isVehicleLinkedView" :transaction="$props.transaction!" @close-modal="closeModal" />
  <div v-else class="rounded-t-xl">
    <div
      :class="[
        'h-3 rounded-t-lg transition-[background-color] duration-200 ease-out',
        currentTxType === FORM_TYPES.income && 'bg-app-income-color',
        currentTxType === FORM_TYPES.expense && 'bg-app-expense-color',
        currentTxType === FORM_TYPES.transfer && 'bg-app-transfer-color',
      ]"
    />
    <div class="mb-4 flex items-center justify-between px-6 py-3">
      <DialogTitle>
        <span class="text-2xl">
          {{
            isReadOnly
              ? $t('dialogs.manageTransaction.detailsTitle')
              : isFormCreation
                ? $t('dialogs.manageTransaction.addTitle')
                : $t('dialogs.manageTransaction.editTitle')
          }}
        </span>
      </DialogTitle>

      <DialogClose>
        <Button variant="ghost"> {{ $t('dialogs.manageTransaction.form.closeButton') }} </Button>
      </DialogClose>
    </div>
    <div class="relative grid grid-cols-1 md:grid-cols-[450px_minmax(0,1fr)]">
      <div class="px-6">
        <type-selector
          :is-form-creation="isFormCreation"
          :selected-transaction-type="currentTxType"
          :transaction="transaction"
          :account="transaction ? accountsRecord[transaction.accountId] : undefined"
          :disabled="isFormFieldsDisabled"
          class="mb-6"
          @change-tx-type="selectTransactionType"
        />

        <div>
          <form-row>
            <input-field
              v-model="form.amount"
              :label="$t('dialogs.manageTransaction.form.amountLabel')"
              type="number"
              :disabled="isFormFieldsDisabled || isAmountFieldDisabled"
              only-positive
              :placeholder="$t('dialogs.manageTransaction.form.amountPlaceholder')"
              :error-message="amountErrorMessage"
              autofocus
              @blur="onAmountBlur"
            >
              <template #iconTrailing>
                <span>{{ currencyCode }}</span>
              </template>
            </input-field>
          </form-row>

          <p v-if="wouldOverdrawLoanSource" class="text-warning-text -mt-1 px-1 text-xs">
            {{ $t('loans.detail.payment.overdrawWarning', { account: form.account?.name ?? '' }) }}
          </p>

          <account-field
            v-model:account="form.account"
            v-model:to-account="form.toAccount"
            v-model:to-portfolio="form.toPortfolio"
            v-model:destination-type="transferDestinationType"
            :disabled="isFormFieldsDisabled"
            :is-transfer-transaction="isTransferTx"
            :is-transaction-linking="!!linkedTransaction"
            :transaction-type="transaction?.transactionType || TRANSACTION_TYPES.expense"
            :accounts="isTransferTx ? transferSourceAccounts : txTargetableSourceAccountsActiveFirst"
            :from-account-disabled="fromAccountFieldDisabled"
            :to-account-disabled="toAccountFieldDisabled"
            :destination-type-disabled="isDestinationTypeLocked"
            :filtered-accounts="transferDestinationAccounts"
            :portfolios="portfolios ?? []"
            :loan-accounts="loanDestinationAccounts"
          />

          <template v-if="!isTransferTx">
            <form-row>
              <category-select-field
                v-model="form.category"
                :label="$t('dialogs.manageTransaction.form.categoryLabel')"
                :values="effectiveFormattedCategories"
                :categories-map="isAccountSharedWithCaller ? effectiveCategoriesMap : undefined"
                :shared-owner-username="isAccountSharedWithCaller ? accountShare?.owner.username : undefined"
                label-key="name"
                :disabled="isFormFieldsDisabled"
                @update:model-value="handleCategoryUserTouched"
              />
            </form-row>

            <!-- Split button and summary -->
            <form-row>
              <template v-if="hasSplits">
                <!-- Splits summary -->
                <button
                  type="button"
                  class="bg-muted/30 hover:bg-muted/50 border-border group flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors"
                  :disabled="isFormFieldsDisabled"
                  @click="isSplitDialogOpen = true"
                >
                  <div class="flex items-center gap-2">
                    <SplitIcon class="text-muted-foreground size-4" />
                    <span class="text-sm font-medium">
                      {{ $t('dialogs.manageTransaction.form.splitInfo', { count: (form.splits?.length ?? 0) + 1 }) }}
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-muted-foreground text-sm tabular-nums">
                      {{ formatUIAmount(splitsTotal, { currency: currencyCode }) }}
                    </span>
                    <span class="text-muted-foreground text-xs">{{
                      $t('dialogs.manageTransaction.form.editSplit')
                    }}</span>
                  </div>
                </button>
              </template>
              <template v-else>
                <!-- Add splits button -->
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  class="w-full border-dashed"
                  :disabled="isFormFieldsDisabled"
                  @click="isSplitDialogOpen = true"
                >
                  <SplitIcon class="mr-2 size-4 opacity-70" />
                  {{ $t('dialogs.manageTransaction.form.addSplitButton') }}
                </Button>
              </template>
            </form-row>

            <!-- Split Dialog -->
            <SplitDialog
              v-model:open="isSplitDialogOpen"
              v-model="form.splits"
              :total-amount="form.amount ? Number(form.amount) : null"
              :currency-code="currencyCode"
              :main-category="form.category"
              :categories="effectiveFormattedCategories"
            />
          </template>

          <template v-if="isTargetFieldVisible">
            <form-row>
              <input-field
                v-model="form.targetAmount"
                :disabled="isFormFieldsDisabled || isTargetAmountFieldDisabled"
                only-positive
                :label="$t('dialogs.manageTransaction.form.targetAmountLabel')"
                :placeholder="$t('dialogs.manageTransaction.form.targetAmountPlaceholder')"
                type="number"
                :error-message="targetAmountErrorMessage"
                @blur="touchField('form.targetAmount')"
              >
                <template #iconTrailing>
                  <span>{{ targetCurrency?.currency?.code }}</span>
                </template>
              </input-field>
            </form-row>
          </template>

          <!-- Transfer linking on accounts shared *with* the caller isn't supported by
               the backend yet – hide the linker for recipients rather than letting
               them trigger a confusing server error. Loan payments never link two
               pre-existing legs (single source → one loan), so it's irrelevant here. -->
          <LinkTransactionSection
            v-if="transferDestinationType === 'account' && !isAccountSharedWithCaller"
            v-model:linked-transaction="linkedTransaction"
            :is-transfer-tx="isTransferTx"
            :is-form-creation="isFormCreation"
            :opposite-transaction="oppositeTransaction"
            :transaction-type="transaction?.transactionType"
            :disabled="isFormFieldsDisabled"
            :origin-transaction-id="transaction?.id"
            :origin-amount="form.amount ? Number(form.amount) : null"
            :origin-account-id="form.account?.id"
            @unlink="unlinkTransactions"
          />

          <form-row>
            <date-field
              v-model="form.time"
              :disabled="isFormFieldsDisabled || isRecordExternal"
              :label="$t('dialogs.manageTransaction.form.datetimeLabel')"
              :calendar-options="{
                maxDate: new Date(),
              }"
            />
          </form-row>

          <p v-if="isPreAnchorLoanPayment" class="text-muted-foreground -mt-1 px-1 text-xs">
            {{ $t('loans.detail.payment.preAnchorHint') }}
          </p>

          <template v-if="currentTxType !== FORM_TYPES.transfer">
            <form-row>
              <payee-select-field
                v-model="form.payeeId"
                :label="$t('dialogs.manageTransaction.form.payeeLabel')"
                :disabled="isFormFieldsDisabled"
                :account-id="resolvedAccountId"
                :owner-scoped="isAccountSharedWithCaller"
                @payee-selected="handlePayeeSelected"
              />
            </form-row>
          </template>
        </div>

        <template v-if="isMobileView">
          <Drawer.Drawer>
            <Drawer.DrawerTrigger class="w-full" as-child>
              <Button variant="secondary" size="default" class="w-full">
                {{ $t('dialogs.manageTransaction.form.moreOptionsButton') }}
              </Button>
            </Drawer.DrawerTrigger>

            <Drawer.DrawerContent>
              <Drawer.DrawerTitle></Drawer.DrawerTitle>
              <div class="bg-card dark:bg-muted dark:shadow-foreground/10 px-6 pt-6 dark:shadow-[inset_2px_4px_12px]">
                <ReuseMoreOptions />
              </div>
            </Drawer.DrawerContent>
          </Drawer.Drawer>
        </template>

        <div class="flex items-center justify-between py-6">
          <Button
            v-if="canDelete"
            class="min-w-25"
            :disabled="isFormFieldsDisabled"
            :aria-label="$t('dialogs.manageTransaction.form.deleteAriaLabel')"
            variant="destructive"
            @click="deleteTransactionHandler"
          >
            {{ $t('dialogs.manageTransaction.form.deleteButton') }}
          </Button>
          <Button
            v-if="!isReadOnly"
            class="ml-auto min-w-30"
            :aria-label="
              isFormCreation
                ? $t('dialogs.manageTransaction.form.createAriaLabel')
                : $t('dialogs.manageTransaction.form.editAriaLabel')
            "
            :disabled="isFormFieldsDisabled"
            @click="submit"
          >
            {{
              isLoading
                ? $t('dialogs.manageTransaction.form.loadingButton')
                : isFormCreation
                  ? $t('dialogs.manageTransaction.form.createButton')
                  : $t('dialogs.manageTransaction.form.editButton')
            }}
          </Button>
        </div>
      </div>

      <div
        v-if="!isMobileView"
        class="bg-muted shadow-foreground/10 px-6 pt-6 shadow-[inset_2px_4px_12px] dark:bg-black/20 dark:shadow-black/40"
      >
        <ReuseMoreOptions />
      </div>
    </div>
  </div>
</template>
