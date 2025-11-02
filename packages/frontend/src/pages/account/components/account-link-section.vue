<script setup lang="ts">
import { linkAccountToBankConnection } from '@/api/accounts';
import {
  type AvailableAccount,
  type BankConnection,
  getAvailableAccounts,
  listConnections,
} from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AlertDialog } from '@/components/common';
import { Button } from '@/components/lib/ui/button';
import { Label } from '@/components/lib/ui/label';
import * as Select from '@/components/lib/ui/select';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable/formatters';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const { formatAmountByCurrencyCode } = useFormatCurrency();
const accountsStore = useAccountsStore();

const isAccountLinkedToBank = computed(() => !!props.account.bankDataProviderConnectionId);
const isSystemAccount = computed(() => props.account.type === 'system');

// Only show for system accounts that are not yet linked
const showLinkOption = computed(() => isSystemAccount.value && !isAccountLinkedToBank.value);

// Form state
const selectedConnectionId = ref<string>(undefined);
const selectedExternalAccountId = ref<string>(undefined);
const isLinking = ref(false);

// Fetch user connections
const { data: connections, isLoading: isLoadingConnections } = useQuery<BankConnection[]>({
  queryKey: VUE_QUERY_CACHE_KEYS.bankConnections,
  queryFn: listConnections,
  enabled: showLinkOption,
});

// Fetch external accounts for selected connection
const { data: externalAccounts, isLoading: isLoadingExternalAccounts } = useQuery<AvailableAccount[]>({
  queryKey: [...VUE_QUERY_CACHE_KEYS.bankAvailableExternalAccounts, selectedConnectionId],
  queryFn: () => getAvailableAccounts(Number(selectedConnectionId.value)),
  enabled: computed(() => !!selectedConnectionId.value),
});

const hasConnections = computed(() => connections.value && connections.value.length > 0);
const hasExternalAccounts = computed(() => externalAccounts.value && externalAccounts.value.length > 0);

const canConfirmLink = computed(() => {
  return (
    !!selectedConnectionId.value &&
    !!selectedExternalAccountId.value &&
    !isLinking.value &&
    !currencyMismatch.value
  );
});

const linkAccount = async () => {
  if (!canConfirmLink.value) return;

  isLinking.value = true;
  try {
    const result = await linkAccountToBankConnection({
      accountId: props.account.id,
      connectionId: Number(selectedConnectionId.value)!,
      externalAccountId: selectedExternalAccountId.value!,
    });

    // Refresh accounts store
    await accountsStore.loadAccounts();

    addSuccessNotification(result.message);
    resetForm();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while trying to link account';
    addErrorNotification(errorMessage);
  } finally {
    isLinking.value = false;
  }
};

const resetForm = () => {
  selectedConnectionId.value = undefined;
  selectedExternalAccountId.value = undefined;
};

const selectedExternalAccount = computed(() => {
  if (!selectedExternalAccountId.value || !externalAccounts.value) return null;
  return externalAccounts.value.find((a) => a.externalId === selectedExternalAccountId.value);
});

const currencyMismatch = computed(() => {
  if (!selectedExternalAccount.value) return false;
  return selectedExternalAccount.value.currency.toLowerCase() !== props.account.currencyCode.toLowerCase();
});

const linkingError = computed(() => {
  if (currencyMismatch.value) {
    return `Currency mismatch: System account uses ${props.account.currencyCode}, but selected external account uses ${selectedExternalAccount.value?.currency}. Please select an account with matching currency.`;
  }
  return null;
});
</script>

<template>
  <div
    v-if="showLinkOption"
    class="flex flex-col justify-between gap-2 @[400px]/danger-zone:flex-row @[400px]/danger-zone:items-center"
  >
    <div>
      <p class="mb-2 font-bold">Link account to bank connection</p>
      <p class="text-xs">
        Connect this system account to a bank connection for automatic transaction syncing.
        <br />
        <b>What will happen:</b>
      </p>
      <ul class="mt-1 ml-4 list-disc text-xs">
        <li>Account will become linked to the selected bank connection</li>
        <li>Existing transactions will be converted to bank type (preserving all data)</li>
        <li>If balances differ, an adjustment transaction will be created</li>
        <li>Future transactions will sync automatically</li>
      </ul>
    </div>

    <AlertDialog
      title="Link Account to Bank Connection"
      :accept-disabled="!canConfirmLink"
      accept-label="Link Account"
      @accept="linkAccount"
    >
      <template #trigger>
        <Button variant="outline" class="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white">
          Link to bank
        </Button>
      </template>

      <template #description>
        <p class="mb-4">Select a bank connection and the corresponding external account to link.</p>

        <div class="space-y-4">
          <!-- Select Bank Connection -->
          <div class="space-y-2">
            <Label for="connection-select">Bank Connection</Label>
            <Select.Select v-model="selectedConnectionId" :disabled="isLoadingConnections || !hasConnections">
              <Select.SelectTrigger id="connection-select">
                <Select.SelectValue placeholder="Select a bank connection" />
              </Select.SelectTrigger>
              <Select.SelectContent>
                <template v-if="isLoadingConnections">
                  <Select.SelectItem disabled value="loading">Loading connections...</Select.SelectItem>
                </template>
                <template v-else-if="hasConnections">
                  <Select.SelectItem v-for="conn in connections" :key="conn.id" :value="String(conn.id)">
                    {{ conn.providerName }}
                  </Select.SelectItem>
                </template>
                <template v-else>
                  <Select.SelectItem disabled value="none">No connections available</Select.SelectItem>
                </template>
              </Select.SelectContent>
            </Select.Select>
          </div>

          <!-- Select External Account -->
          <div v-if="selectedConnectionId" class="space-y-2">
            <Label for="account-select">External Account</Label>
            <Select.Select
              v-model="selectedExternalAccountId"
              :disabled="isLoadingExternalAccounts || !hasExternalAccounts"
            >
              <Select.SelectTrigger id="account-select">
                <Select.SelectValue placeholder="Select an external account" />
              </Select.SelectTrigger>
              <Select.SelectContent>
                <template v-if="isLoadingExternalAccounts">
                  <Select.SelectItem disabled value="loading">Loading accounts...</Select.SelectItem>
                </template>
                <template v-else-if="hasExternalAccounts">
                  <Select.SelectItem v-for="acc in externalAccounts" :key="acc.externalId" :value="acc.externalId">
                    {{ acc.name }} ({{ formatAmountByCurrencyCode(acc.balance, acc.currency) }})
                  </Select.SelectItem>
                </template>
                <template v-else>
                  <Select.SelectItem disabled value="none">No external accounts available</Select.SelectItem>
                </template>
              </Select.SelectContent>
            </Select.Select>
          </div>

          <!-- Currency Mismatch Error -->
          <div v-if="linkingError" class="rounded-md bg-destructive/10 p-3 text-sm">
            <p class="font-semibold text-destructive">⚠️ Cannot Link Account</p>
            <p class="mt-1 text-xs text-destructive">{{ linkingError }}</p>
          </div>

          <!-- Balance Preview -->
          <div v-else-if="selectedExternalAccount" class="rounded-md bg-muted p-3 text-sm">
            <p class="mb-1 font-semibold">Current Balance Comparison:</p>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <p class="text-muted-foreground">System Account:</p>
                <p class="font-mono">
                  {{ formatAmountByCurrencyCode(account.currentBalance, account.currencyCode) }}
                </p>
              </div>
              <div>
                <p class="text-muted-foreground">External Account:</p>
                <p class="font-mono">
                  {{ formatAmountByCurrencyCode(selectedExternalAccount.balance, selectedExternalAccount.currency) }}
                </p>
              </div>
            </div>
            <p class="mt-2 text-xs text-yellow-600">
              If balances differ, an adjustment transaction will be created automatically.
            </p>
          </div>
        </div>
      </template>
    </AlertDialog>
  </div>
</template>
