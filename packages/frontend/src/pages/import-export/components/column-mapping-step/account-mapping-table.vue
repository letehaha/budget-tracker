<template>
  <div>
    <h3 class="mb-3 text-sm font-semibold">{{ t('pages.importExport.accountMappingTable.title') }}</h3>
    <p class="text-muted-foreground mb-4 text-sm">
      {{ t('pages.importExport.accountMappingTable.description') }}
    </p>

    <div class="overflow-x-auto rounded-lg border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="border-b px-4 py-3 text-left font-medium">
              {{ t('pages.importExport.accountMappingTable.csvAccountName') }}
            </th>
            <th class="border-b px-4 py-3 text-left font-medium">
              {{ t('pages.importExport.accountMappingTable.currency') }}
            </th>
            <th class="border-b px-4 py-3 text-left font-medium">
              {{ t('pages.importExport.accountMappingTable.action') }}
            </th>
            <th class="border-b px-4 py-3 text-left font-medium">
              {{ t('pages.importExport.accountMappingTable.targetAccount') }}
            </th>
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
                :placeholder="$t('pages.importExport.common.selectAction')"
                @update:model-value="handleActionChange(sourceAccount.name, $event)"
              />
            </td>
            <td class="px-4 py-3">
              <div v-if="getAccountAction(sourceAccount.name) === 'link-existing'">
                <Select.Select
                  :model-value="getAccountSelectValue(sourceAccount.name)"
                  @update:model-value="handleAccountSelect(sourceAccount.name, String($event))"
                >
                  <Select.SelectTrigger class="h-9">
                    <Select.SelectValue :placeholder="$t('pages.importExport.accountMapping.selectAccount')">
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
                          —
                          {{
                            t('pages.importExport.accountMappingTable.mappedTo', {
                              name: getMappedToAccountName(account.id),
                            })
                          }}
                        </span>
                      </span>
                    </Select.SelectItem>
                  </Select.SelectContent>
                </Select.Select>
                <p
                  v-if="getFilteredAccounts(sourceAccount.currency).length === 0"
                  class="text-destructive-text mt-1 text-xs"
                >
                  {{
                    t('pages.importExport.accountMappingTable.noMatchingCurrency', { currency: sourceAccount.currency })
                  }}
                </p>
              </div>
              <div
                v-else-if="getAccountAction(sourceAccount.name) === 'create-new'"
                class="text-muted-foreground text-sm"
              >
                {{
                  t('pages.importExport.accountMappingTable.willBeCreated', {
                    name: sourceAccount.name,
                    currency: sourceAccount.currency || t('pages.importExport.accountMappingTable.defaultCurrency'),
                  })
                }}
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
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface OptionItem {
  label: string;
  value: string;
}

const importStore = useImportExportStore();
const accountsStore = useAccountsStore();
const { accounts } = storeToRefs(accountsStore);

const actionOptions = computed<OptionItem[]>(() => [
  { label: t('pages.importExport.accountMappingTable.actions.createNew'), value: 'create-new' },
  { label: t('pages.importExport.accountMappingTable.actions.mapToExisting'), value: 'link-existing' },
]);

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
  return actionOptions.value.find((opt) => opt.value === action) ?? null;
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
    return account
      ? `${account.name} (${account.currencyCode})`
      : t('pages.importExport.accountMappingTable.selectAccount');
  }
  return t('pages.importExport.accountMappingTable.selectAccount');
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
