<template>
  <div class="p-6">
    <div class="mb-6">
      <router-link
        :to="{ name: ROUTES_NAMES.accountIntegrations }"
        class="text-muted-foreground hover:text-foreground text-sm"
      >
        ← Back to Integrations
      </router-link>
      <h1 class="mt-4 text-2xl tracking-wider">Connect {{ providerName }}</h1>
    </div>

    <Card class="max-w-2xl">
      <CardHeader class="pb-4">
        <div class="text-lg font-medium">{{ stepTitle }}</div>
      </CardHeader>
      <CardContent>
        <!-- Step 1: Enter API Token -->
        <template v-if="currentStep === 1">
          <div class="space-y-4">
            <div>
              <label class="mb-2 block text-sm font-medium">API Token</label>
              <input
                v-model="apiToken"
                type="password"
                class="w-full rounded-md border px-3 py-2"
                placeholder="Enter your Monobank API token"
                @keyup.enter="handleConnectProvider"
              />
              <p class="text-muted-foreground mt-1 text-xs">You can get your API token from Monobank mobile app</p>
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
            <div class="flex gap-2">
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
              <div class="text-muted-foreground mb-4 text-sm">
                Select the accounts you want to sync with Budget Tracker
              </div>

              <div class="space-y-2">
                <label
                  v-for="account in availableAccounts"
                  :key="account.externalId"
                  class="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border p-3"
                >
                  <input type="checkbox" :value="account.externalId" v-model="selectedAccountIds" class="h-4 w-4" />
                  <div class="flex-1">
                    <div class="font-medium">{{ account.name }}</div>
                    <div class="text-muted-foreground text-sm">
                      {{ formatBalance(account.balance, account.currency) }}
                    </div>
                  </div>
                </label>
              </div>

              <div class="flex gap-2 pt-4">
                <UiButton @click="handleSyncAccounts" :disabled="selectedAccountIds.length === 0 || isLoading">
                  {{ isLoading ? 'Syncing...' : `Sync ${selectedAccountIds.length} account(s)` }}
                </UiButton>
                <UiButton variant="outline" @click="currentStep = 1" :disabled="isLoading"> Back </UiButton>
              </div>
            </template>
          </div>
        </template>
      </CardContent>
    </Card>
  </div>
</template>

<script lang="ts" setup>
import {
  type AvailableAccount,
  connectProvider,
  getAvailableAccounts,
  listProviders,
  syncSelectedAccounts,
} from '@/api/bank-data-providers';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const currenciesStore = useCurrenciesStore();

const providerType = computed(() => route.params.providerType as string);
const providerName = ref('');

const currentStep = ref(1);
const isLoading = ref(false);

// Step 1 data
const apiToken = ref('');
const connectionName = ref('');
const connectionId = ref<number | null>(null);

// Step 2 data
const availableAccounts = ref<AvailableAccount[]>([]);
const selectedAccountIds = ref<string[]>([]);

const stepTitle = computed(() => {
  switch (currentStep.value) {
    case 1:
      return 'Enter API Token';
    case 2:
      return 'Select Accounts to Sync';
    default:
      return '';
  }
});

const handleConnectProvider = async () => {
  if (!apiToken.value || isLoading.value) return;

  try {
    isLoading.value = true;

    // Step 1: Connect provider
    const response = await connectProvider(
      providerType.value,
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
    await currenciesStore.loadCurrencies();

    addSuccessNotification(`Successfully synced ${selectedAccountIds.value.length} account(s)`);

    // Redirect to accounts page
    router.push({ name: ROUTES_NAMES.accounts });
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

const loadProviderInfo = async () => {
  try {
    const providers = await listProviders();
    const provider = providers.find((p) => p.type === providerType.value);
    if (provider) {
      providerName.value = provider.name;
    }
  } catch {
    // Fallback to provider type
    providerName.value = providerType.value;
  }
};

onMounted(() => {
  loadProviderInfo();
});
</script>
