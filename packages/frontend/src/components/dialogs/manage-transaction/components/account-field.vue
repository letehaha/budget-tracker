<template>
  <template v-if="accounts.length || account">
    <template v-if="isTransferTransaction && !isTransactionLinking">
      <form-row>
        <select-field
          :label="$t('dialogs.manageTransaction.form.fromAccountLabel')"
          :placeholder="$t('dialogs.manageTransaction.form.selectAccountPlaceholder')"
          :values="accounts"
          :label-key="getAccountLabel"
          value-key="id"
          with-search
          :disabled="disabled || fromAccountDisabled"
          is-value-preselected
          :model-value="account"
          @update:model-value="updateFormAccount"
        >
          <template #select-bottom-content>
            <CreateAccountDialog>
              <UiButton type="button" class="mt-4 w-full" variant="link">
                {{ $t('dialogs.manageTransaction.form.addNewAccountButton') }}
              </UiButton>
            </CreateAccountDialog>
          </template>
        </select-field>
      </form-row>

      <form-row>
        <select-field
          :label="$t('dialogs.manageTransaction.form.toAccountLabel')"
          :placeholder="$t('dialogs.manageTransaction.form.selectAccountPlaceholder')"
          :values="filteredAccounts"
          :label-key="getAccountLabel"
          value-key="id"
          with-search
          :disabled="disabled || toAccountDisabled"
          :model-value="toAccount"
          @update:model-value="updateToAccount"
        >
          <template #select-bottom-content>
            <CreateAccountDialog>
              <UiButton type="button" class="mt-4 w-full" variant="link">
                {{ $t('dialogs.manageTransaction.form.addNewAccountButton') }}
              </UiButton>
            </CreateAccountDialog>
          </template>
        </select-field>
      </form-row>
    </template>
    <template v-else>
      <form-row>
        <select-field
          :label="$t('dialogs.manageTransaction.form.accountLabel')"
          :placeholder="$t('dialogs.manageTransaction.form.selectAccountPlaceholder')"
          :values="accounts"
          :label-key="getAccountLabel"
          value-key="id"
          with-search
          :disabled="disabled || fromAccountDisabled"
          is-value-preselected
          :model-value="account"
          @update:model-value="updateFormAccount"
        >
          <template #select-bottom-content>
            <CreateAccountDialog>
              <UiButton type="button" class="mt-4 w-full" variant="link">
                {{ $t('dialogs.manageTransaction.form.addNewAccountButton') }}
              </UiButton>
            </CreateAccountDialog>
          </template>
        </select-field>
      </form-row>
    </template>
  </template>
  <template v-else>
    <form-row>
      <input-field
        :model-value="$t('dialogs.manageTransaction.form.noAccountExists')"
        :label="$t('dialogs.manageTransaction.form.accountLabel')"
        readonly
        :disabled="disabled"
      >
        <template #label-right>
          <CreateAccountDialog>
            <div class="text-primary cursor-pointer hover:underline">
              {{ $t('dialogs.manageTransaction.form.createAccountLink') }}
            </div>
          </CreateAccountDialog>
        </template>
      </input-field>
    </form-row>
  </template>
</template>

<script setup lang="ts">
import CreateAccountDialog from '@/components/dialogs/create-account-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { AccountModel, TRANSACTION_TYPES } from '@bt/shared/types';
import { useI18n } from 'vue-i18n';

import FormRow from './form-row.vue';

const { t } = useI18n();

// Helper to get account label - translates if it's a translation key (for OUT_OF_WALLET_ACCOUNT_MOCK)
const getAccountLabel = (account: AccountModel & { _isOutOfWallet?: boolean }) => {
  if (account._isOutOfWallet) {
    return t(account.name);
  }
  return account.name;
};

withDefaults(
  defineProps<{
    account?: AccountModel | null;
    toAccount?: AccountModel | null;
    isTransferTransaction: boolean;
    accounts: AccountModel[];
    filteredAccounts: AccountModel[];
    isTransactionLinking?: boolean;
    transactionType: TRANSACTION_TYPES;
    fromAccountDisabled?: boolean;
    toAccountDisabled?: boolean;
    disabled?: boolean;
  }>(),
  {
    account: null,
    toAccount: null,
    isTransactionLinking: false,
    fromAccountDisabled: false,
    toAccountDisabled: false,
  },
);

const emit = defineEmits(['update:account', 'update:to-account']);

const updateFormAccount = (account: AccountModel) => {
  emit('update:account', account);
};

const updateToAccount = (account: AccountModel) => {
  emit('update:to-account', account);
};
</script>
