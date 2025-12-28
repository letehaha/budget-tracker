<template>
  <div class="space-y-4">
    <!-- Step 1: Enter API Token -->
    <template v-if="currentStep === 1">
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium">API Token</label>
          <input
            v-model="apiToken"
            type="password"
            class="w-full rounded-md border px-3 py-2"
            placeholder="Enter your Monobank API token"
            @keyup.enter="handleConnectProvider"
          />

          <Tooltip.TooltipProvider>
            <Tooltip.Tooltip>
              <Tooltip.TooltipTrigger class="mt-2 flex items-center gap-2">
                <p class="text-muted-foreground text-xs">You can get your API token from Monobank mobile app</p>
                <InfoIcon class="text-primary size-4" />
              </Tooltip.TooltipTrigger>
              <Tooltip.TooltipContent class="max-w-[400px] p-4">
                <span class="text-sm leading-6 opacity-90">
                  To obtain a token for personal use please visit
                  <ExternalLink href="https://api.monobank.ua" />
                  and follow instructions. Once token is generated, store it somewhere and enter into the field.
                  <br />
                  <b>Note:</b> Don't worry, the API token is strictly read-only.
                </span>
              </Tooltip.TooltipContent>
            </Tooltip.Tooltip>
          </Tooltip.TooltipProvider>
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium">Connection Name (optional)</label>
          <input
            v-model="connectionName"
            type="text"
            class="w-full rounded-md border px-3 py-2"
            placeholder="e.g., Personal Account"
          />
        </div>
        <div class="flex justify-between gap-2">
          <UiButton variant="outline" @click="$emit('cancel')" :disabled="isLoading"> Back </UiButton>

          <UiButton @click="handleConnectProvider" :disabled="!apiToken || isLoading">
            {{ isLoading ? 'Connecting...' : 'Connect' }}
          </UiButton>
        </div>
      </div>
    </template>

    <!-- Step 2: Select Accounts -->
    <template v-else-if="currentStep === 2">
      <div class="space-y-4">
        <div v-if="isLoading" class="py-8 text-center">Loading accounts...</div>

        <template v-else>
          <div class="text-muted-foreground mb-4 text-sm">Select the accounts you want to sync with MoneyMatter</div>

          <div class="space-y-2">
            <label
              v-for="account in availableAccounts"
              :key="account.externalId"
              class="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border p-3"
            >
              <input type="checkbox" :value="account.externalId" v-model="selectedAccountIds" class="size-4" />
              <div class="flex-1">
                <div class="font-medium">{{ account.name }}</div>
                <div class="text-muted-foreground text-sm">
                  {{ formatBalance(account.balance, account.currency) }}
                </div>
              </div>
            </label>
          </div>

          <div class="flex justify-between gap-2 pt-4">
            <UiButton variant="outline" @click="currentStep = 1" :disabled="isLoading"> Back </UiButton>

            <UiButton @click="handleSyncAccounts" :disabled="selectedAccountIds.length === 0 || isLoading">
              {{ isLoading ? 'Syncing...' : `Sync ${selectedAccountIds.length} account(s)` }}
            </UiButton>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import {
  type AvailableAccount,
  connectProvider,
  getAvailableAccounts,
  syncSelectedAccounts,
} from '@/api/bank-data-providers';
import ExternalLink from '@/components/external-link.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Tooltip from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore } from '@/stores';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { InfoIcon } from 'lucide-vue-next';
import { ref } from 'vue';

const emit = defineEmits<{
  connected: [];
  cancel: [];
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();

const currentStep = ref(1);
const isLoading = ref(false);

// Step 1 data
const apiToken = ref('');
const connectionName = ref('');
const connectionId = ref<number | null>(null);

// Step 2 data
const availableAccounts = ref<AvailableAccount[]>([]);
const selectedAccountIds = ref<string[]>([]);

const handleConnectProvider = async () => {
  if (!apiToken.value || isLoading.value) return;

  try {
    isLoading.value = true;

    // Step 1: Connect provider
    const response = await connectProvider(
      BANK_PROVIDER_TYPE.MONOBANK,
      { apiToken: apiToken.value },
      connectionName.value || undefined,
    );

    connectionId.value = response.connectionId;

    // Step 2: Fetch available accounts
    const accounts = await getAvailableAccounts(response.connectionId);
    availableAccounts.value = accounts;

    // Move to step 2
    currentStep.value = 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to connect provider';
    addErrorNotification(message);
  } finally {
    isLoading.value = false;
  }
};

const handleSyncAccounts = async () => {
  if (!connectionId.value || selectedAccountIds.value.length === 0 || isLoading.value) {
    return;
  }

  try {
    isLoading.value = true;

    await syncSelectedAccounts(connectionId.value, selectedAccountIds.value);

    // Refresh accounts store
    await accountsStore.refetchAccounts();

    addSuccessNotification(`Successfully synced ${selectedAccountIds.value.length} account(s)`);

    // Emit connected event to close dialog
    emit('connected');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync accounts';
    addErrorNotification(message);
  } finally {
    isLoading.value = false;
  }
};

const formatBalance = (balance: number, currency: string) => {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency,
  }).format(balance);
};
</script>
