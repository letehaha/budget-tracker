<template>
  <div>
    <h3 class="mb-3 text-sm font-semibold">Account Mapping</h3>
    <p class="text-muted-foreground mb-4 text-sm">
      Map CSV account names to your existing accounts or create new ones. Only accounts with matching currency will be
      shown.
    </p>

    <div class="overflow-x-auto rounded-lg border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="border-b px-4 py-3 text-left font-medium">CSV Account Name</th>
            <th class="border-b px-4 py-3 text-left font-medium">Currency</th>
            <th class="border-b px-4 py-3 text-left font-medium">Action</th>
            <th class="border-b px-4 py-3 text-left font-medium">Target Account</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="sourceAccount in importStore.uniqueAccountsInCSV"
            :key="sourceAccount.name"
            class="border-b last:border-b-0"
          >
            <td class="px-4 py-3 font-medium">{{ sourceAccount.name }}</td>
            <td class="text-muted-foreground px-4 py-3">{{ sourceAccount.currency || '—' }}</td>
            <td class="px-4 py-3">
              <SelectField
                :model-value="getAccountActionObject(sourceAccount.name)"
                :values="actionOptions"
                placeholder="Select action..."
                @update:model-value="handleActionChange(sourceAccount.name, $event)"
              />
            </td>
            <td class="px-4 py-3">
              <div v-if="getAccountAction(sourceAccount.name) === 'link-existing'">
                <Select.Select
                  :model-value="getAccountSelectValue(sourceAccount.name)"
                  @update:model-value="handleAccountSelect(sourceAccount.name, $event)"
                >
                  <Select.SelectTrigger class="h-9">
                    <Select.SelectValue placeholder="Select account...">
                      {{ getAccountDisplayValue(sourceAccount.name) }}
                    </Select.SelectValue>
                  </Select.SelectTrigger>
                  <Select.SelectContent>
                    <Select.SelectItem
                      v-for="account in getFilteredAccounts(sourceAccount.currency)"
                      :key="account.id"
                      :value="String(account.id)"
                      :disabled="isAccountMapped(account.id, sourceAccount.name)"
                    >
                      <span :class="{ 'text-muted-foreground': isAccountMapped(account.id, sourceAccount.name) }">
                        {{ account.name }} ({{ account.currencyCode }})
                        <span
                          v-if="isAccountMapped(account.id, sourceAccount.name)"
                          class="text-muted-foreground text-xs"
                        >
                          — mapped to "{{ getMappedToAccountName(account.id) }}"
                        </span>
                      </span>
                    </Select.SelectItem>
                  </Select.SelectContent>
                </Select.Select>
                <p
                  v-if="getFilteredAccounts(sourceAccount.currency).length === 0"
                  class="text-destructive mt-1 text-xs"
                >
                  No accounts available with matching currency ({{ sourceAccount.currency }})
                </p>
              </div>
              <div
                v-else-if="getAccountAction(sourceAccount.name) === 'create-new'"
                class="text-muted-foreground text-sm"
              >
                New account "{{ sourceAccount.name }}" will be created with
                {{ sourceAccount.currency || 'default' }} currency
              </div>
              <div v-else class="text-muted-foreground text-sm">—</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import * as Select from '@/components/lib/ui/select';
import { useAccountsStore } from '@/stores/accounts';
import { useImportExportStore } from '@/stores/import-export';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

interface OptionItem {
  label: string;
  value: string;
}

const importStore = useImportExportStore();
const accountsStore = useAccountsStore();
const { accounts } = storeToRefs(accountsStore);

const actionOptions: OptionItem[] = [
  { label: 'Create New Account', value: 'create-new' },
  { label: 'Map to Existing Account', value: 'link-existing' },
];

// Create a reverse mapping to find which CSV account name maps to which system account ID
const accountIdToCSVName = computed(() => {
  const mapping: Record<number, string> = {};
  for (const [csvName, value] of Object.entries(importStore.accountMapping)) {
    if (value.action === 'link-existing') {
      mapping[value.accountId] = csvName;
    }
  }
  return mapping;
});

const getAccountAction = (accountName: string): string => {
  const mapping = importStore.accountMapping[accountName];
  if (!mapping) return '';
  return mapping.action;
};

const getAccountActionObject = (accountName: string): OptionItem | null => {
  const action = getAccountAction(accountName);
  if (!action) return null;
  return actionOptions.find((opt) => opt.value === action) ?? null;
};

const handleActionChange = (accountName: string, option: OptionItem | null) => {
  if (!option) {
    delete importStore.accountMapping[accountName];
    return;
  }

  const action = option.value;
  if (action === 'create-new') {
    importStore.accountMapping[accountName] = { action: 'create-new' };
  } else if (action === 'link-existing') {
    // Set action but no accountId yet - user needs to select
    importStore.accountMapping[accountName] = { action: 'link-existing', accountId: 0 };
  }
};

const handleAccountSelect = (accountName: string, value: string) => {
  const accountId = Number(value);
  if (accountId) {
    importStore.accountMapping[accountName] = { action: 'link-existing', accountId };
  }
};

const getAccountSelectValue = (accountName: string): string => {
  const mapping = importStore.accountMapping[accountName];
  if (mapping?.action === 'link-existing' && mapping.accountId) {
    return String(mapping.accountId);
  }
  return '';
};

const getAccountDisplayValue = (accountName: string): string => {
  const mapping = importStore.accountMapping[accountName];
  if (mapping?.action === 'link-existing' && mapping.accountId) {
    const account = accounts.value.find((acc) => acc.id === mapping.accountId);
    return account ? `${account.name} (${account.currencyCode})` : 'Select account...';
  }
  return 'Select account...';
};

const isAccountMapped = (accountId: number, currentAccountName: string): boolean => {
  // Check if this account ID is already mapped to a different CSV account
  const mappedTo = accountIdToCSVName.value[accountId];
  return mappedTo !== undefined && mappedTo !== currentAccountName;
};

const getMappedToAccountName = (accountId: number): string => {
  return accountIdToCSVName.value[accountId] || '';
};

const getFilteredAccounts = (targetCurrency: string) => {
  if (!targetCurrency) return accounts.value;
  return accounts.value.filter((acc) => acc.currencyCode === targetCurrency);
};
</script>
