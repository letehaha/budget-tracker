<template>
  <div class="bg-muted/30 mt-6 rounded-lg border p-4">
    <h3 class="mb-4 text-sm font-semibold">Account Assignment <span class="text-destructive-text">*</span></h3>

    <!-- Option Selection -->
    <div class="mb-4">
      <SelectField
        :model-value="selectedOptionObject"
        :values="accountOptions"
        label="How do you want to assign accounts?"
        placeholder="Select option..."
        @update:model-value="handleOptionChange"
      />
      <p class="text-muted-foreground mt-1 text-xs">Choose how accounts should be assigned to imported transactions</p>
    </div>

    <!-- Column Selection (for data-source-column) -->
    <div v-if="selectedOption === AccountOptionValue.dataSourceColumn">
      <SelectField
        :model-value="accountColumnObject"
        :values="columnOptions"
        label="Account Column"
        placeholder="Select column..."
        @update:model-value="handleColumnChange"
      />
      <p class="text-muted-foreground mt-1 text-xs">Select the CSV column that contains account names</p>
    </div>

    <!-- Account Selection (if existing-account) -->
    <div v-if="selectedOption === AccountOptionValue.existingAccount">
      <SelectField
        :model-value="selectedAccount"
        :values="enabledAccounts"
        label="Account"
        label-key="name"
        value-key="id"
        placeholder="Select account..."
        with-search
        :search-keys="['name']"
        @update:model-value="handleAccountSelect"
      />
      <p class="text-muted-foreground mt-1 text-xs">All imported transactions will be assigned to this account</p>
    </div>

    <p
      v-if="selectedOption === AccountOptionValue.dataSourceColumn"
      class="bg-primary/10 border-primary mt-4 rounded-lg border p-3 text-sm"
    >
      ℹ️ You'll map each CSV account to your existing accounts on the next step
    </p>
  </div>
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import { useAccountsStore } from '@/stores/accounts';
import { useImportExportStore } from '@/stores/import-export';
import { AccountModel, AccountOptionValue } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

interface OptionItem {
  label: string;
  value: string;
}

const importStore = useImportExportStore();
const accountsStore = useAccountsStore();
const { enabledAccounts } = storeToRefs(accountsStore);

const accountOptions: OptionItem[] = [
  {
    label: 'Map each CSV account to existing accounts (on next step)',
    value: AccountOptionValue.dataSourceColumn,
  },
  {
    label: 'Assign all to single existing account',
    value: AccountOptionValue.existingAccount,
  },
];

const columnOptions = computed<OptionItem[]>(() =>
  importStore.csvHeaders.map((header) => ({
    label: header,
    value: header,
  })),
);

const selectedOption = computed(() => {
  if (!importStore.columnMapping.account) return '';
  return importStore.columnMapping.account.option;
});

const selectedOptionObject = computed(() => {
  if (!selectedOption.value) return null;
  return accountOptions.find((opt) => opt.value === selectedOption.value) ?? null;
});

const accountColumn = computed(() => {
  const acc = importStore.columnMapping.account;
  if (acc && acc.option === AccountOptionValue.dataSourceColumn) {
    return acc.columnName;
  }
  return null;
});

const accountColumnObject = computed(() => {
  if (!accountColumn.value) return null;
  return columnOptions.value.find((opt) => opt.value === accountColumn.value) ?? null;
});

const selectedAccount = computed<AccountModel | null>(() => {
  const acc = importStore.columnMapping.account;
  if (acc && acc.option === AccountOptionValue.existingAccount) {
    return enabledAccounts.value.find((a) => a.id === acc.accountId) ?? null;
  }
  return null;
});

const handleOptionChange = (option: OptionItem | null) => {
  if (!option) {
    importStore.columnMapping.account = null;
    return;
  }

  switch (option.value) {
    case AccountOptionValue.dataSourceColumn:
      importStore.columnMapping.account = { option: AccountOptionValue.dataSourceColumn, columnName: '' };
      break;
    case AccountOptionValue.existingAccount:
      importStore.columnMapping.account = { option: AccountOptionValue.existingAccount, accountId: 0 };
      break;
  }
};

const handleColumnChange = (column: OptionItem | null) => {
  const currentOption = importStore.columnMapping.account;

  if (column && currentOption && currentOption.option === AccountOptionValue.dataSourceColumn) {
    importStore.columnMapping.account = { option: AccountOptionValue.dataSourceColumn, columnName: column.value };
  }
};

const handleAccountSelect = (account: AccountModel | null) => {
  if (account) {
    importStore.columnMapping.account = { option: AccountOptionValue.existingAccount, accountId: account.id };
  }
};
</script>
