<template>
  <div class="p-6">
    <div v-if="isLoading" class="py-8 text-center">Loading...</div>

    <div v-else-if="error" class="rounded-lg border border-red-500 p-4 text-red-700">
      <p>Failed to load integration details. Please try again.</p>
      <UiButton variant="outline" class="mt-4" @click="router.push({ name: ROUTES_NAMES.accountIntegrations })">
        Back to Integrations
      </UiButton>
    </div>

    <template v-else-if="connectionDetails">
      <!-- Header with back button -->
      <div class="mb-6 flex items-center gap-4">
        <UiButton variant="ghost" size="icon" @click="router.push({ name: ROUTES_NAMES.accountIntegrations })">
          <span class="text-xl">←</span>
        </UiButton>
        <h1 class="text-2xl tracking-wider">{{ connectionDetails.providerName }}</h1>
      </div>

      <!-- Connection Details Card -->
      <Card class="mb-6">
        <CardHeader>
          <h2 class="text-lg font-semibold tracking-wide">Connection Details</h2>
        </CardHeader>
        <CardContent>
          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <p class="text-muted-foreground text-sm">Provider</p>
              <p class="font-medium">{{ connectionDetails.provider.name }}</p>
            </div>
            <div>
              <p class="text-muted-foreground text-sm">Type</p>
              <p class="font-medium">{{ connectionDetails.providerType }}</p>
            </div>
            <div>
              <p class="text-muted-foreground text-sm">Status</p>
              <p class="font-medium">{{ connectionDetails.isActive ? 'Active' : 'Inactive' }}</p>
            </div>
            <div>
              <p class="text-muted-foreground text-sm">Last Sync</p>
              <p class="font-medium">
                {{ connectionDetails.lastSyncAt ? formatDate(connectionDetails.lastSyncAt) : 'Never' }}
              </p>
            </div>
            <div>
              <p class="text-muted-foreground text-sm">Created</p>
              <p class="font-medium">{{ formatDate(connectionDetails.createdAt) }}</p>
            </div>
            <div>
              <p class="text-muted-foreground text-sm">Connected Accounts</p>
              <p class="font-medium">{{ connectionDetails.accounts.length }}</p>
            </div>
          </div>

          <div v-if="connectionDetails.provider.description" class="mt-4">
            <p class="text-muted-foreground text-sm">Description</p>
            <p class="mt-1">{{ connectionDetails.provider.description }}</p>
          </div>
        </CardContent>
      </Card>

      <!-- Connected Accounts Card -->
      <Card class="mb-6">
        <CardHeader class="flex flex-row items-center justify-between">
          <h2 class="text-lg font-semibold tracking-wide">Connected Accounts</h2>
          <UiButton size="sm" @click="openFetchAccountsDialog">Connect Remaining Accounts</UiButton>
        </CardHeader>
        <CardContent>
          <div v-if="connectionDetails.accounts.length === 0" class="text-muted-foreground space-y-4 py-8 text-center">
            <p>No accounts connected yet.</p>

            <UiButton size="sm" @click="openFetchAccountsDialog">Connect Accounts</UiButton>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="account in connectionDetails.accounts"
              :key="account.id"
              class="flex items-center justify-between rounded-lg border p-4"
            >
              <div class="flex-1">
                <p class="font-medium">{{ account.name }}</p>
                <p class="text-muted-foreground text-sm">{{ account.type }}</p>
                <p class="text-muted-foreground text-sm">External ID: {{ account.externalId }}</p>
              </div>
              <div class="text-right">
                <p class="font-semibold">{{ formatCurrency(account.currentBalance) }} {{ account.currencyCode }}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Actions Card -->
      <Card>
        <CardHeader>
          <h2 class="text-lg font-semibold tracking-wide">Actions</h2>
        </CardHeader>
        <CardContent>
          <div class="flex gap-4">
            <UiButton variant="destructive" :disabled="isDisconnecting" @click="openDisconnectDialog">
              Disconnect Integration
            </UiButton>
          </div>
        </CardContent>
      </Card>
    </template>

    <!-- Fetch Accounts Dialog -->
    <Dialog v-model:open="isFetchAccountsDialogOpen">
      <DialogContent class="max-h-screen max-w-2xl overflow-y-auto">
        <DialogHeader class="mb-4">
          <DialogTitle>Connect Remaining Accounts</DialogTitle>

          <DialogDescription class="mt-2">
            Select available accounts from {{ connectionDetails?.providerName }} that are not yet connected.
          </DialogDescription>
        </DialogHeader>

        <div v-if="isLoadingAvailableAccounts" class="py-8 text-center">Loading available accounts...</div>

        <div v-else-if="availableAccountsError" class="rounded-lg border border-red-500 bg-red-50 p-4 text-red-700">
          Failed to load available accounts. Please try again.
        </div>

        <div v-else-if="availableAccounts && availableAccounts.length === 0" class="py-8 text-center">
          <p class="text-muted-foreground">No additional accounts available to connect.</p>
        </div>

        <div v-else-if="availableAccounts && availableAccounts.length > 0" class="grid gap-3">
          <label
            v-for="account in availableAccounts"
            :key="account.externalId"
            class="flex gap-3 rounded-lg border p-3 max-sm:flex-col sm:items-center sm:justify-between"
            :class="{
              'opacity-60': isAccountConnected(account.externalId),
              'cursor-pointer': !isAccountConnected(account.externalId),
            }"
          >
            <div class="grow">
              <div class="flex items-center gap-2 overflow-hidden">
                <p class="shrink truncate font-medium whitespace-nowrap">{{ account.name }}</p>

                <span
                  v-if="isAccountConnected(account.externalId)"
                  class="bg-success rounded px-2 py-0.5 text-xs font-medium text-white"
                >
                  Connected
                </span>
              </div>
              <p class="text-muted-foreground text-sm">{{ account.type }}</p>
            </div>

            <div class="flex items-center gap-4">
              <div class="text-right">
                <p class="font-semibold whitespace-nowrap">
                  {{ formatCurrency(account.balance) }} {{ account.currency }}
                </p>
              </div>

              <input
                v-model="selectedAccountIds"
                type="checkbox"
                :value="account.externalId"
                :disabled="isAccountConnected(account.externalId)"
                class="size-4 rounded border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </label>
        </div>

        <DialogFooter class="mt-8 grid gap-3 sm:grid-cols-2">
          <UiButton variant="outline" @click="isFetchAccountsDialogOpen = false">Cancel</UiButton>
          <UiButton
            :disabled="isSyncingAccounts || selectedAccountIds.length === 0"
            @click="handleSyncSelectedAccounts"
          >
            <template v-if="selectedAccountIds.length">
              <span>
                Connect Selected Accounts <span class="tabular-nums">({{ selectedAccountIds.length }})</span>
              </span>
            </template>
            <template v-else>
              <span>Select Accounts</span>
            </template>
          </UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Disconnect Dialog -->
    <DisconnectIntegrationDialog
      v-model:open="isDisconnectDialogOpen"
      :is-disconnecting="isDisconnecting"
      @confirm="handleDisconnectConfirm"
    />
  </div>
</template>

<script lang="ts" setup>
import {
  disconnectProvider,
  getAvailableAccounts,
  getConnectionDetails,
  syncSelectedAccounts,
} from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/lib/ui/dialog';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import DisconnectIntegrationDialog from './components/DisconnectIntegrationDialog.vue';

const route = useRoute();
const router = useRouter();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const queryClient = useQueryClient();

const connectionId = computed(() => Number(route.params.connectionId));
const isFetchAccountsDialogOpen = ref(false);
const isDisconnectDialogOpen = ref(false);
const selectedAccountIds = ref<string[]>([]);

// Query for connection details
const {
  data: connectionDetails,
  isLoading,
  error,
} = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.bankConnectionDetails, connectionId.value],
  queryFn: () => getConnectionDetails(connectionId.value),
  staleTime: 60 * 1000, // 1 minute
});

// Query for available accounts (only when dialog is open)
const {
  data: availableAccounts,
  isLoading: isLoadingAvailableAccounts,
  error: availableAccountsError,
} = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.bankAvailableExternalAccounts, connectionId.value],
  queryFn: () => getAvailableAccounts(connectionId.value),
  enabled: isFetchAccountsDialogOpen,
  staleTime: 60 * 1000, // 30 seconds
});

// Mutation for syncing selected accounts
const { mutate: syncAccountsMutation, isPending: isSyncingAccounts } = useMutation({
  mutationFn: (accountIds: string[]) => syncSelectedAccounts(connectionId.value, accountIds),
  onSuccess: () => {
    addSuccessNotification('Accounts connected successfully');
    queryClient.invalidateQueries({
      predicate: (query) => {
        const queryKey = query.queryKey as string[];

        return (
          queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.transactionChange) ||
          queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.bankConnectionChange)
        );
      },
    });
    isFetchAccountsDialogOpen.value = false;
    selectedAccountIds.value = [];
  },
  onError: () => {
    addErrorNotification('Failed to connect accounts');
  },
});

// Mutation for disconnecting provider
const { mutate: disconnectMutation, isPending: isDisconnecting } = useMutation({
  mutationFn: disconnectProvider,
  onSuccess: () => {
    addSuccessNotification('Integration disconnected successfully');
    queryClient.invalidateQueries({
      predicate: (query) => {
        const queryKey = query.queryKey as string[];
        return (
          queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.transactionChange) ||
          queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.bankConnectionChange)
        );
      },
    });
    router.push({ name: ROUTES_NAMES.accountIntegrations });
  },
  onError: () => {
    addErrorNotification('Failed to disconnect integration');
  },
});

const isAccountConnected = (externalId: string): boolean => {
  return connectionDetails.value?.accounts.some((account) => account.externalId === externalId) ?? false;
};

const openFetchAccountsDialog = () => {
  isFetchAccountsDialogOpen.value = true;
};

const openDisconnectDialog = () => {
  isDisconnectDialogOpen.value = true;
};

const handleSyncSelectedAccounts = () => {
  if (selectedAccountIds.value.length === 0) return;
  syncAccountsMutation(selectedAccountIds.value);
};

const handleDisconnectConfirm = (removeAssociatedAccounts: boolean) => {
  disconnectMutation({
    connectionId: connectionId.value,
    removeAssociatedAccounts,
  });
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Reset selected accounts when dialog closes
watch(isFetchAccountsDialogOpen, (isOpen) => {
  if (!isOpen) {
    selectedAccountIds.value = [];
  }
});
</script>
