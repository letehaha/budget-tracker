<script lang="ts" setup>
import {
  unlinkTransactions as apiUnlinkTransactions,
  createTransaction,
  deleteTransaction,
  editTransaction,
  linkTransactions,
} from '@/api';
import { OUT_OF_WALLET_ACCOUNT_MOCK, VERBOSE_PAYMENT_TYPES, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import { Button } from '@/components/lib/ui/button';
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { useNotificationCenter } from '@/components/notification-center';
import TransactionRecrod from '@/components/transactions-list/transaction-record.vue';
import { getInvalidationQueryKey } from '@/composable/data-queries/opposite-tx-record';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ApiErrorResponseError } from '@/js/errors';
import { useAccountsStore, useCategoriesStore, useCurrenciesStore } from '@/stores';
import {
  ACCOUNT_TYPES,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  type TransactionModel,
} from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { watchOnce } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { DialogClose, DialogTitle } from 'radix-vue';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import AccountField from './components/account-field.vue';
import FormRow from './components/form-row.vue';
import MarkAsRefundField from './components/mark-as-refund/mark-as-refund-field.vue';
import TypeSelector from './components/type-selector.vue';
import { getRefundInfo, useTransferFormLogic } from './composables';
import { prepopulateForm } from './helpers';
import RecordList from './record-list.vue';
import { FORM_TYPES, UI_FORM_STRUCT } from './types';
import { prepareTxCreationParams, prepareTxUpdationParams } from './utils';

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

const emit = defineEmits(['close-modal']);
const closeModal = () => {
  emit('close-modal');
};

const route = useRoute();
watch(() => route.path, closeModal);

const { addErrorNotification } = useNotificationCenter();
const { currenciesMap } = storeToRefs(useCurrenciesStore());
const { accountsRecord, systemAccounts } = storeToRefs(useAccountsStore());
const { formattedCategories, categoriesMap } = storeToRefs(useCategoriesStore());
const queryClient = useQueryClient();

const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const isFormCreation = computed(() => !props.transaction);

const form = ref<UI_FORM_STRUCT>({
  amount: null,
  account: null,
  toAccount: null,
  targetAmount: null,
  category: formattedCategories.value[0],
  time: new Date(),
  paymentType: VERBOSE_PAYMENT_TYPES.find((item) => item.value === PAYMENT_TYPES.creditCard),
  note: null,
  type: FORM_TYPES.expense,
  refundedByTxs: undefined,
  refundsTx: undefined,
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

const isRecordExternal = computed(() => {
  if (!props.transaction) return false;
  // Check the account type, not the transaction type
  // A system transaction in a monobank account should be treated as external
  const account = accountsRecord.value[props.transaction.accountId];
  return account && account.type !== ACCOUNT_TYPES.system;
});
// If record is external, the account field will be disabled, so we need to preselect
// the account
watch(
  () => isRecordExternal.value,
  (value) => {
    if (value && props.transaction.transferNature !== TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) {
      nextTick(() => {
        if (accountsRecord.value[props.transaction.accountId]) {
          form.value.account = accountsRecord.value[props.transaction.accountId];
        }
      });
    }
  },
  { immediate: true },
);

const isLoading = ref(false);
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
  transaction: props.transaction,
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
    if (props.transaction.transactionType === TRANSACTION_TYPES.expense) {
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
  if (form.value.account?.currencyCode) {
    return currenciesMap.value[form.value.account.currencyCode].currency.code;
  }
  return undefined;
});

watch(
  () => [currentTxType.value, linkedTransaction.value],
  ([txType, isLinked], [prevTxType]) => {
    if (props.transaction) {
      // If it's a transaction coming from props it means user currectly edits the form.
      // When switching between transfer type and others we need to keep consistent fields
      // fulfillment
      const { amount, transactionType, accountId, transferNature } = props.transaction;

      if (isLinked) {
        form.value.amount = amount;
        form.value.account = accountsRecord.value[accountId];
      } else if (txType === FORM_TYPES.transfer) {
        if (transactionType === TRANSACTION_TYPES.income) {
          form.value.targetAmount = amount;
          form.value.amount = null;

          form.value.toAccount = accountsRecord.value[accountId];
          form.value.account = null;

          if (transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) {
            form.value.account = OUT_OF_WALLET_ACCOUNT_MOCK;
          }
        }
      } else if (prevTxType === FORM_TYPES.transfer) {
        if (transactionType === TRANSACTION_TYPES.income) {
          form.value.amount = amount;
          form.value.targetAmount = null;

          form.value.account = accountsRecord.value[accountId];
          form.value.toAccount = null;
        }
      }
    }
  },
);

const submit = async () => {
  isLoading.value = true;

  try {
    if (isFormCreation.value) {
      await createTransaction(
        // TODO: unit tests for "prepareTxCreationParams" and "prepareTxUpdationParams"
        prepareTxCreationParams({
          form: form.value,
          isTransferTx: isTransferTx.value,
          isCurrenciesDifferent: isCurrenciesDifferent.value,
          // linkedTransaction: linkedTransaction.value,
        }),
      );
    } else if (linkedTransaction.value) {
      await linkTransactions({
        ids: [[props.transaction.id, linkedTransaction.value.id]],
      });
    } else {
      await editTransaction(
        prepareTxUpdationParams({
          form: form.value,
          transaction: props.transaction,
          linkedTransaction: linkedTransaction.value,
          isTransferTx: isTransferTx.value,
          isRecordExternal: isRecordExternal.value,
          isCurrenciesDifferent: isCurrenciesDifferent.value,
          isOriginalRefundsOverriden: isOriginalRefundsOverriden.value,
        }),
      );
    }

    closeModal();
    // Reload all cached data in the app
    queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
    if (props.transaction?.id) {
      queryClient.invalidateQueries({
        queryKey: getInvalidationQueryKey(props.transaction.id),
      });
    }
    if (props.oppositeTransaction?.id) {
      queryClient.invalidateQueries({
        queryKey: getInvalidationQueryKey(props.oppositeTransaction.id),
      });
    }
  } catch (e) {
    if (e instanceof ApiErrorResponseError) {
      addErrorNotification(e.data.message);
    } else {
      // eslint-disable-next-line no-console
      console.error(e);
      addErrorNotification('Unexpected error!');
    }
  } finally {
    isLoading.value = false;
  }
};

const unlinkTransactions = async () => {
  try {
    isLoading.value = true;

    await apiUnlinkTransactions({
      transferIds: [props.transaction.transferId],
    });

    closeModal();
    // Reload all cached data in the app
    queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.securityPriceChange] });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
  } finally {
    isLoading.value = false;
  }
};

const deleteTransactionHandler = async () => {
  try {
    // Check the account type, not the transaction type
    const account = accountsRecord.value[props.transaction.accountId];
    if (account && account.type !== ACCOUNT_TYPES.system) return;

    isLoading.value = true;

    await deleteTransaction(props.transaction.id);

    closeModal();
    // Reload all cached data in the app
    queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.securityPriceChange] });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    isLoading.value = false;
  }
};

const deleteTransactionRecordHandler = () => {
  linkedTransaction.value = null;
};

const selectTransactionType = (type: FORM_TYPES, disabled = false) => {
  if (!disabled) form.value.type = type;
};

// Stores element that was focused before modal was opened, to then focus it back
// when modal will be closed
const previouslyFocusedElement = ref(document.activeElement);

onMounted(() => {
  if (!props.transaction) {
    form.value.account = systemAccounts.value[0];
  } else {
    const data = prepopulateForm({
      transaction: props.transaction,
      oppositeTransaction: props.oppositeTransaction,
      accounts: accountsRecord.value,
      categories: categoriesMap.value,
    });
    if (data) form.value = data;
  }
});

onUnmounted(() => {
  (previouslyFocusedElement.value as HTMLElement).focus();
});
</script>

<template>
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
          {{ isFormCreation ? 'Add Transaction' : 'Edit Transaction' }}
        </span>
      </DialogTitle>

      <DialogClose>
        <Button variant="ghost"> Close </Button>
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
              label="Amount"
              type="number"
              :disabled="isFormFieldsDisabled || isAmountFieldDisabled"
              only-positive
              placeholder="Amount"
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
            :transaction-type="props.transaction?.transactionType || TRANSACTION_TYPES.expense"
            :accounts="isTransferTx ? transferSourceAccounts : systemAccounts"
            :from-account-disabled="fromAccountFieldDisabled"
            :to-account-disabled="toAccountFieldDisabled"
            :filtered-accounts="transferDestinationAccounts"
            @close-modal="closeModal"
          />

          <template v-if="currentTxType !== FORM_TYPES.transfer">
            <form-row>
              <category-select-field
                v-model="form.category"
                label="Category"
                :values="formattedCategories"
                label-key="name"
                :disabled="isFormFieldsDisabled"
              />
            </form-row>
          </template>

          <template v-if="isTargetFieldVisible">
            <form-row>
              <input-field
                v-model="form.targetAmount"
                :disabled="isFormFieldsDisabled || isTargetAmountFieldDisabled"
                only-positive
                label="Target amount"
                placeholder="Target amount"
                type="number"
              >
                <template #iconTrailing>
                  <span>{{ targetCurrency?.currency?.code }}</span>
                </template>
              </input-field>
            </form-row>
          </template>

          <template v-if="isTransferTx && !linkedTransaction && !isFormCreation && !Boolean(oppositeTransaction)">
            <form-row>
              <Dialog.Dialog>
                <Dialog.DialogTrigger>
                  <Button class="w-full" :disabled="isFormFieldsDisabled" size="sm"> Link existing transaction </Button>
                </Dialog.DialogTrigger>

                <Dialog.DialogContent>
                  <RecordList
                    :transaction-type="
                      transaction?.transactionType === TRANSACTION_TYPES.expense
                        ? TRANSACTION_TYPES.income
                        : TRANSACTION_TYPES.expense
                    "
                    @select="linkedTransaction = $event"
                  />
                </Dialog.DialogContent>
              </Dialog.Dialog>
            </form-row>
          </template>

          <template v-if="isTransferTx && oppositeTransaction">
            <form-row>
              <Button class="w-full" :disabled="isFormFieldsDisabled" size="sm" @click="unlinkTransactions">
                Unlink transactions
              </Button>
            </form-row>
          </template>

          <template v-if="linkedTransaction && isTransferTx && !isFormCreation">
            <form-row class="flex items-center gap-2.5">
              <TransactionRecrod class="bg-background" :tx="linkedTransaction" />

              <Button
                aria-label="Cancel linking"
                :disabled="isFormFieldsDisabled"
                size="sm"
                @click="deleteTransactionRecordHandler"
              >
                Cancel
              </Button>
            </form-row>
          </template>

          <form-row>
            <date-field
              v-model="form.time"
              :disabled="isFormFieldsDisabled || isRecordExternal"
              label="Datetime"
              :calendar-options="{
                maxDate: new Date(),
              }"
            />
          </form-row>
        </div>

        <template v-if="isMobileView">
          <Drawer.Drawer>
            <Drawer.DrawerTrigger class="w-full" as-child>
              <Button variant="secondary" size="default" class="w-full"> More options </Button>
            </Drawer.DrawerTrigger>

            <Drawer.DrawerContent>
              <Drawer.DrawerTitle></Drawer.DrawerTitle>
              <div class="bg-black/20 px-6 pt-6 shadow-[inset_2px_4px_12px] shadow-black/40">
                <form-row>
                  <select-field
                    v-model="form.paymentType"
                    label="Payment Type"
                    :disabled="isFormFieldsDisabled || isRecordExternal"
                    :values="VERBOSE_PAYMENT_TYPES"
                    is-value-preselected
                  />
                </form-row>
                <form-row>
                  <textarea-field
                    v-model="form.note"
                    placeholder="Note"
                    :disabled="isFormFieldsDisabled"
                    label="Note (optional)"
                  />
                </form-row>
                <template v-if="!isTransferTx">
                  <form-row>
                    <MarkAsRefundField
                      v-model:refunds="form.refundsTx"
                      v-model:refunded-by="form.refundedByTxs"
                      :transaction-id="transaction?.id"
                      :is-record-creation="isFormCreation"
                      :transaction-type="refundTransactionsTypeBasedOnFormType"
                      :disabled="isFormFieldsDisabled"
                      :is-there-original-refunds="Boolean(originalRefunds.length)"
                    />
                  </form-row>
                </template>
              </div>
            </Drawer.DrawerContent>
          </Drawer.Drawer>
        </template>

        <div class="flex items-center justify-between py-6">
          <Button
            v-if="transaction && accountsRecord[transaction.accountId]?.type === ACCOUNT_TYPES.system"
            class="min-w-[100px]"
            :disabled="isFormFieldsDisabled"
            aria-label="Delete transaction"
            variant="destructive"
            @click="deleteTransactionHandler"
          >
            Delete
          </Button>
          <Button
            class="ml-auto min-w-[120px]"
            :aria-label="isFormCreation ? 'Create transaction' : 'Edit transaction'"
            :disabled="isFormFieldsDisabled"
            @click="submit"
          >
            {{ isLoading ? 'Loading...' : isFormCreation ? 'Create' : 'Edit' }}
          </Button>
        </div>
      </div>

      <template v-if="!isMobileView">
        <div class="bg-black/20 px-6 pt-6 shadow-[inset_2px_4px_12px] shadow-black/40">
          <form-row>
            <select-field
              v-model="form.paymentType"
              label="Payment Type"
              :disabled="isFormFieldsDisabled || isRecordExternal"
              :values="VERBOSE_PAYMENT_TYPES"
              is-value-preselected
            />
          </form-row>
          <form-row>
            <textarea-field
              v-model="form.note"
              placeholder="Note"
              :disabled="isFormFieldsDisabled"
              label="Note (optional)"
            />
          </form-row>
          <template v-if="!isTransferTx">
            <form-row>
              <MarkAsRefundField
                v-model:refunds="form.refundsTx"
                v-model:refunded-by="form.refundedByTxs"
                :transaction-id="transaction?.id"
                :is-record-creation="isFormCreation"
                :transaction-type="refundTransactionsTypeBasedOnFormType"
                :disabled="isFormFieldsDisabled"
                :is-there-original-refunds="Boolean(originalRefunds.length)"
              />
            </form-row>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
