<template>
  <template v-if="accounts.length || account">
    <template v-if="isTransferTransaction && !isTransactionLinking">
      <form-row>
        <select-field
          label="From account"
          placeholder="Select account"
          :values="accounts"
          label-key="name"
          value-key="id"
          with-search
          :disabled="disabled || fromAccountDisabled"
          is-value-preselected
          :model-value="account"
          @update:model-value="updateFormAccount"
        >
          <template #select-bottom-content>
            <CreateAccountDialog>
              <UiButton type="button" class="mt-4 w-full" variant="link"> Add new account + </UiButton>
            </CreateAccountDialog>
          </template>
        </select-field>
      </form-row>

      <form-row>
        <select-field
          label="To account"
          placeholder="Select account"
          :values="filteredAccounts"
          label-key="name"
          value-key="id"
          with-search
          :disabled="disabled || toAccountDisabled"
          :model-value="toAccount"
          @update:model-value="updateToAccount"
        >
          <template #select-bottom-content>
            <CreateAccountDialog>
              <UiButton type="button" class="mt-4 w-full" variant="link"> Add new account + </UiButton>
            </CreateAccountDialog>
          </template>
        </select-field>
      </form-row>
    </template>
    <template v-else>
      <form-row>
        <select-field
          label="Account"
          placeholder="Select account"
          :values="accounts"
          label-key="name"
          value-key="id"
          with-search
          :disabled="disabled || fromAccountDisabled"
          is-value-preselected
          :model-value="account"
          @update:model-value="updateFormAccount"
        >
          <template #select-bottom-content>
            <CreateAccountDialog>
              <UiButton type="button" class="mt-4 w-full" variant="link"> Add new account + </UiButton>
            </CreateAccountDialog>
          </template>
        </select-field>
      </form-row>
    </template>
  </template>
  <template v-else>
    <form-row>
      <input-field model-value="No account exists" label="Account" readonly :disabled="disabled">
        <template #label-right>
          <CreateAccountDialog>
            <div class="text-primary cursor-pointer hover:underline">Create account</div>
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

import FormRow from './form-row.vue';

withDefaults(
  defineProps<{
    account?: AccountModel | null;
    toAccount?: AccountModel | null;
    isTransferTransaction: boolean;
    accounts: AccountModel[];
    filteredAccounts: AccountModel[];
    isTransactionLinking: boolean;
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
