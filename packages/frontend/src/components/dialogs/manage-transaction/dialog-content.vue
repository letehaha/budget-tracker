<script lang="ts" setup>
import { OUT_OF_WALLET_ACCOUNT_MOCK, VERBOSE_PAYMENT_TYPES } from '@/common/const';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import TagSelectField from '@/components/fields/tag-select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import { Button } from '@/components/lib/ui/button';
import * as Drawer from '@/components/lib/ui/drawer';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { formatUIAmount } from '@/js/helpers';
import { useAccountsStore, useCategoriesStore, useCurrenciesStore, useTagsStore } from '@/stores';
import {
  ACCOUNT_TYPES,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  type TransactionModel,
} from '@bt/shared/types';
import { createReusableTemplate, watchOnce } from '@vueuse/core';
import { SplitIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { DialogClose, DialogTitle } from 'reka-ui';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import AccountField from './components/account-field.vue';
import FormRow from './components/form-row.vue';
import LinkTransactionSection from './components/link-transaction-section.vue';
import MarkAsRefundField from './components/mark-as-refund/mark-as-refund-field.vue';
import SplitDialog from './components/split-dialog.vue';
import TypeSelector from './components/type-selector.vue';
import {
  getRefundInfo,
  useDeleteTransaction,
  useSubmitTransaction,
  useTransferFormLogic,
  useUnlinkTransactions,
} from './composables';
import { prepopulateForm } from './helpers';
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

// Normalize transactions so that `transaction` is always the expense (source) side
// and `oppositeTransaction` is always the income (destination) side.
// This ensures consistent form population regardless of how props are passed.
const shouldSwapTransactions = computed(() => {
  return (
    props.transaction &&
    props.oppositeTransaction &&
    props.oppositeTransaction.transactionType === TRANSACTION_TYPES.expense
  );
});

const transaction = computed(() => (shouldSwapTransactions.value ? props.oppositeTransaction : props.transaction));

const oppositeTransaction = computed(() =>
  shouldSwapTransactions.value ? props.transaction : props.oppositeTransaction,
);

const emit = defineEmits(['close-modal']);
const closeModal = () => {
  emit('close-modal');
};

const route = useRoute();
const { t } = useI18n();
watch(() => route.path, closeModal);

const { currenciesMap } = storeToRefs(useCurrenciesStore());
const { accountsRecord, systemAccounts } = storeToRefs(useAccountsStore());
const { formattedCategories, categoriesMap } = storeToRefs(useCategoriesStore());
const tagsStore = useTagsStore();
// Load tags when the dialog opens
tagsStore.loadTags();

const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const isFormCreation = computed(() => !props.transaction);

const form = ref<UI_FORM_STRUCT>({
  amount: null,
  account: null,
  toAccount: null,
  targetAmount: null,
  category: formattedCategories.value[0]!,
  time: new Date(),
  paymentType: VERBOSE_PAYMENT_TYPES.find((item) => item.value === PAYMENT_TYPES.creditCard) ?? null,
  note: undefined,
  type: FORM_TYPES.expense,
  refundedByTxs: undefined,
  refundsTx: undefined,
  tagIds: [],
});

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
// If record is external, the account field will be disabled, so we need to preselect
// the account
watch(
  () => isRecordExternal.value,
  (value) => {
    if (value && transaction.value?.transferNature !== TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) {
      nextTick(() => {
        if (transaction.value && accountsRecord.value[transaction.value.accountId]) {
          form.value.account = accountsRecord.value[transaction.value.accountId]!;
        }
      });
    }
  },
  { immediate: true },
);

const submitMutation = useSubmitTransaction({ onSuccess: closeModal });
const unlinkMutation = useUnlinkTransactions({ onSuccess: closeModal });
const deleteMutation = useDeleteTransaction({ onSuccess: closeModal });

const isLoading = computed(
  () => submitMutation.isPending.value || unlinkMutation.isPending.value || deleteMutation.isPending.value,
);
const isFormFieldsDisabled = computed(() => isLoading.value || !isInitialRefundsDataLoaded.value);

const currentTxType = computed(() => form.value.type);
const isTransferTx = computed(() => currentTxType.value === FORM_TYPES.transfer);

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

watch(
  () => [currentTxType.value, linkedTransaction.value],
  ([txType, isLinked], [prevTxType]) => {
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

const submit = () => {
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
  unlinkMutation.mutate({
    transferIds: [transaction.value!.transferId],
    transactionId: transaction.value?.id,
    oppositeTransactionId: oppositeTransaction.value?.id,
  });
};

const deleteTransactionHandler = () => {
  // Check the account type, not the transaction type
  const account = accountsRecord.value[transaction.value!.accountId];
  if (account && account.type !== ACCOUNT_TYPES.system) return;

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

onMounted(() => {
  if (!transaction.value) {
    form.value.account = systemAccounts.value[0] ?? null;
  } else {
    const data = prepopulateForm({
      transaction: transaction.value,
      oppositeTransaction: oppositeTransaction.value,
      accounts: accountsRecord.value,
      categories: categoriesMap.value,
      formattedCategories: formattedCategories.value,
    });
    if (data) form.value = data;
  }
});

onUnmounted(() => {
  (previouslyFocusedElement.value as HTMLElement).focus();
});
</script>

<template>
  <!-- Define reusable template for "More Options" section (payment type, note, refund) -->
  <DefineMoreOptions>
    <FormRow>
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
    <FormRow>
      <TagSelectField
        v-model="form.tagIds"
        :label="$t('dialogs.manageTransaction.form.tagsLabel')"
        :disabled="isFormFieldsDisabled"
      />
    </FormRow>
    <template v-if="!isTransferTx">
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

  <div class="rounded-t-xl">
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
          {{ isFormCreation ? $t('dialogs.manageTransaction.addTitle') : $t('dialogs.manageTransaction.editTitle') }}
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
              autofocus
            >
              <template #iconTrailing>
                <span>{{ currencyCode }}</span>
              </template>
            </input-field>
          </form-row>

          <account-field
            v-model:account="form.account"
            v-model:to-account="form.toAccount"
            :disabled="isFormFieldsDisabled"
            :is-transfer-transaction="isTransferTx"
            :is-transaction-linking="!!linkedTransaction"
            :transaction-type="transaction?.transactionType || TRANSACTION_TYPES.expense"
            :accounts="isTransferTx ? transferSourceAccounts : systemAccounts"
            :from-account-disabled="fromAccountFieldDisabled"
            :to-account-disabled="toAccountFieldDisabled"
            :filtered-accounts="transferDestinationAccounts"
          />

          <template v-if="currentTxType !== FORM_TYPES.transfer">
            <form-row>
              <category-select-field
                v-model="form.category"
                :label="$t('dialogs.manageTransaction.form.categoryLabel')"
                :values="formattedCategories"
                label-key="name"
                :disabled="isFormFieldsDisabled"
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
              >
                <template #iconTrailing>
                  <span>{{ targetCurrency?.currency?.code }}</span>
                </template>
              </input-field>
            </form-row>
          </template>

          <LinkTransactionSection
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
              <div class="bg-black/20 px-6 pt-6 shadow-[inset_2px_4px_12px] shadow-black/40">
                <ReuseMoreOptions />
              </div>
            </Drawer.DrawerContent>
          </Drawer.Drawer>
        </template>

        <div class="flex items-center justify-between py-6">
          <Button
            v-if="transaction && accountsRecord[transaction.accountId]?.type === ACCOUNT_TYPES.system"
            class="min-w-25"
            :disabled="isFormFieldsDisabled"
            :aria-label="$t('dialogs.manageTransaction.form.deleteAriaLabel')"
            variant="destructive"
            @click="deleteTransactionHandler"
          >
            {{ $t('dialogs.manageTransaction.form.deleteButton') }}
          </Button>
          <Button
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

      <div v-if="!isMobileView" class="bg-black/20 px-6 pt-6 shadow-[inset_2px_4px_12px] shadow-black/40">
        <ReuseMoreOptions />
      </div>
    </div>
  </div>
</template>
