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
        <UiButton variant="ghost" size="icon" @click="openEditNameDialog">
          <PencilIcon class="size-4" />
        </UiButton>
      </div>

      <!-- Connection Details Card -->
      <Card class="mb-6">
        <Collapsible v-model:open="isConnectionDetailsOpen">
          <CollapsibleTrigger class="flex w-full cursor-pointer items-center justify-between p-6">
            <h2 class="text-lg font-semibold tracking-wide">Connection Details</h2>
            <ChevronDownIcon
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': isConnectionDetailsOpen }"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent class="pt-0 max-sm:px-4 max-sm:pb-4">
              <div class="grid gap-4 md:grid-cols-2">
                <div>
                  <p class="text-muted-foreground text-sm">Type</p>
                  <p class="mt-1 flex items-center gap-2 font-medium">
                    <BankProviderLogo class="size-5" :provider="connectionDetails.providerType" />

                    {{ METAINFO_FROM_TYPE[connectionDetails.providerType].name }}
                  </p>
                </div>
                <div>
                  <p class="text-muted-foreground text-sm">Status</p>
                  <p class="font-medium">{{ connectionDetails.isActive ? 'Active' : 'Inactive' }}</p>
                </div>
                <div>
                  <p class="text-muted-foreground flex items-center gap-1 text-sm">
                    Auto-Sync

                    <ResponsiveTooltip
                      content="Auto-sync is triggered each time you log in, if more than 12 hours have passed since the last sync. You can also trigger a sync manually from the header at any time."
                      content-class-name="max-w-[300px] text-sm leading-6 text-white/90"
                    >
                      <InfoIcon class="text-primary size-4 cursor-pointer" />
                    </ResponsiveTooltip>
                  </p>
                  <p class="font-medium">
                    Every 12 hours
                    <span class="text-muted-foreground font-normal">
                      (last {{ formatRelativeTime(connectionDetails.lastSyncAt) }})
                    </span>
                  </p>
                </div>
                <div>
                  <p class="text-muted-foreground text-sm">Connected Accounts</p>
                  <p class="font-medium">{{ connectionDetails.accounts.length }}</p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <!-- Consent Validity Card (for Enable Banking) -->
      <Card
        v-if="connectionDetails.consent"
        class="mb-6"
        :class="{
          'border-yellow-500': connectionDetails.consent.isExpiringSoon,
          'border-destructive': connectionDetails.consent.isExpired,
        }"
      >
        <Collapsible v-model:open="isConnectionValidityOpen">
          <CollapsibleTrigger class="flex w-full cursor-pointer items-center justify-between p-6">
            <div class="flex items-center gap-3">
              <h2 class="text-lg font-semibold tracking-wide">Connection Validity</h2>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="{
                  'bg-success text-success-text':
                    !connectionDetails.consent.isExpired && !connectionDetails.consent.isExpiringSoon,
                  'bg-yellow-500/40 text-white': connectionDetails.consent.isExpiringSoon,
                  'bg-destructive/20 text-destructive-text': connectionDetails.consent.isExpired,
                }"
              >
                {{
                  connectionDetails.consent.isExpired
                    ? 'Expired'
                    : connectionDetails.consent.isExpiringSoon
                      ? 'Expiring Soon'
                      : 'Active'
                }}
              </span>
            </div>
            <ChevronDownIcon
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': isConnectionValidityOpen }"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent class="pt-0 max-sm:px-4 max-sm:pb-4">
              <div class="space-y-4">
                <!-- Expiration Warning -->
                <div
                  v-if="connectionDetails.consent.isExpired"
                  class="text-destructive-text bg-destructive/20 rounded-lg p-4"
                >
                  <p class="font-semibold">⚠️ Connection Expired</p>
                  <p class="mt-1 text-sm">
                    Your bank connection has expired. Please reconnect to continue syncing transactions.
                  </p>
                </div>
                <div
                  v-else-if="connectionDetails.consent.isExpiringSoon"
                  class="rounded-lg bg-yellow-100 p-4 text-yellow-800"
                >
                  <p class="font-semibold">⚠️ Expiring Soon</p>
                  <p class="mt-1 text-sm">
                    Your bank connection will expire in {{ connectionDetails.consent.daysRemaining }} day{{
                      connectionDetails.consent.daysRemaining !== 1 ? 's' : ''
                    }}. Please reconnect soon to avoid interruption.
                  </p>
                </div>

                <!-- Validity Details -->
                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <p class="text-muted-foreground text-sm">Valid From</p>
                    <p class="font-medium">
                      {{
                        connectionDetails.consent.validFrom ? formatDate(connectionDetails.consent.validFrom) : 'N/A'
                      }}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted-foreground text-sm">Valid Until</p>
                    <p class="font-medium">
                      {{ formatDate(connectionDetails.consent.validUntil) }}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted-foreground text-sm">Days Remaining</p>
                    <p
                      class="font-medium"
                      :class="{
                        'text-destructive-text': connectionDetails.consent.isExpired,
                        'text-yellow-600': connectionDetails.consent.isExpiringSoon,
                      }"
                    >
                      {{ connectionDetails.consent.daysRemaining }} day{{
                        connectionDetails.consent.daysRemaining !== 1 ? 's' : ''
                      }}
                    </p>
                  </div>
                </div>

                <!-- Reconnect Button -->
                <div class="pt-2">
                  <p
                    v-if="!connectionDetails.consent.isExpired && !connectionDetails.consent.isExpiringSoon"
                    class="text-muted-foreground mb-3 text-sm"
                  >
                    Connection is valid. You can still reconnect to refresh available accounts or extend the connection
                    validity.
                  </p>
                  <UiButton variant="default" @click="openReconnectDialog"> Reconnect Now </UiButton>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <!-- Connected Accounts Card -->
      <Card class="mb-6">
        <Collapsible class="@container/connect-accounts" v-model:open="isConnectedAccountsOpen">
          <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 p-6">
            <CollapsibleTrigger class="flex flex-1 cursor-pointer items-center justify-between gap-2">
              <h2 class="text-lg font-semibold tracking-wide whitespace-nowrap">Connected Accounts</h2>

              <ChevronDownIcon
                class="size-5 transition-transform duration-200"
                :class="{ 'rotate-180': isConnectedAccountsOpen }"
              />
            </CollapsibleTrigger>

            <UiButton class="ml-auto hidden @[550px]/connect-accounts:block" size="sm" @click="openFetchAccountsDialog">
              Connect Remaining Accounts
            </UiButton>
          </div>
          <CollapsibleContent>
            <CardContent class="pt-0">
              <UiButton
                class="mb-4 ml-auto block @[550px]/connect-accounts:hidden"
                size="sm"
                @click="openFetchAccountsDialog"
              >
                Connect Remaining Accounts
              </UiButton>

              <div
                v-if="connectionDetails.accounts.length === 0"
                class="text-muted-foreground space-y-4 py-8 text-center"
              >
                <p>No accounts connected yet.</p>

                <UiButton size="sm" @click="openFetchAccountsDialog">Connect Accounts</UiButton>
              </div>

              <div v-else class="space-y-3">
                <router-link
                  v-for="account in connectionDetails.accounts"
                  :key="account.id"
                  :to="`/account/${account.id}`"
                  class="flex items-center justify-between gap-4 rounded-lg border p-4"
                >
                  <div class="flex-1 truncate">
                    <p class="font-medium">{{ account.name }}</p>
                    <p class="text-muted-foreground text-sm">{{ account.type }}</p>
                    <p class="text-muted-foreground truncate text-sm whitespace-nowrap">
                      External ID: {{ account.externalId }}
                    </p>
                  </div>
                  <div class="text-right whitespace-nowrap">
                    <p class="font-semibold">{{ formatCurrency(account.currentBalance) }} {{ account.currencyCode }}</p>
                  </div>
                </router-link>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <!-- Actions Card -->
      <Card>
        <CardHeader>
          <h2 class="text-lg font-semibold tracking-wide">Actions</h2>
        </CardHeader>

        <CardContent>
          <div class="flex gap-4 max-sm:p-4">
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

            <div class="mt-2">
              <Popover.Popover>
                <Popover.PopoverTrigger class="text-primary flex cursor-pointer items-center gap-2 text-sm">
                  Don't see your accounts? <InfoIcon class="size-4" />
                </Popover.PopoverTrigger>
                <Popover.PopoverContent class="max-w-[320px]">
                  <p class="text-sm leading-6">
                    If you can't see some of your accounts, try reconnecting your bank connection from the
                    <strong>Connection Validity</strong> section by clicking <strong>Reconnect Now</strong>.
                  </p>
                  <p class="text-muted-foreground mt-2 text-sm">
                    If the issue persists, please report it for further investigation.
                  </p>
                </Popover.PopoverContent>
              </Popover.Popover>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div v-if="isLoadingAvailableAccounts" class="py-8 text-center">Loading available accounts...</div>

        <div v-else-if="availableAccountsError" class="border-destructive text-destructive-text rounded-lg border p-4">
          <p v-if="isForbiddenError">Your session has expired. Please reconnect your bank connection to continue.</p>
          <p v-else>Failed to load available accounts. Please try again.</p>
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

    <!-- Edit Connection Name Dialog -->
    <EditConnectionNameDialog
      v-model:open="isEditNameDialogOpen"
      :provider-name="connectionDetails?.providerName || ''"
      :is-saving="isSavingName"
      @save="handleSaveConnectionName"
    />

    <!-- Reconnect Confirmation Dialog -->
    <ReconnectConfirmationDialog
      v-model:open="isReconnectDialogOpen"
      :is-pending="isReconnectPending"
      @confirm="handleReconnect"
    />
  </div>
</template>

<script lang="ts" setup>
import {
  disconnectProvider,
  getAvailableAccounts,
  reauthorizeConnection,
  syncSelectedAccounts,
  updateConnectionDetails,
} from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { METAINFO_FROM_TYPE } from '@/common/const/bank-providers';
import BankProviderLogo from '@/components/common/bank-providers/bank-provider-logo.vue';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/lib/ui/dialog';
import * as Popover from '@/components/lib/ui/popover';
import { useNotificationCenter } from '@/components/notification-center';
import { useBankConnectionDetails } from '@/composable/data-queries/bank-providers/bank-connection-details';
import { ApiErrorResponseError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes';
import { API_ERROR_CODES } from '@bt/shared/types/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ChevronDownIcon, InfoIcon, PencilIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import DisconnectIntegrationDialog from './components/disconnect-integration-dialog.vue';
import EditConnectionNameDialog from './components/edit-connection-name-dialog.vue';
import ReconnectConfirmationDialog from './components/reconnect-confirmation-dialog.vue';

const route = useRoute();
const router = useRouter();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const queryClient = useQueryClient();

const connectionId = computed(() => Number(route.params.connectionId));
const isFetchAccountsDialogOpen = ref(false);
const isDisconnectDialogOpen = ref(false);
const isEditNameDialogOpen = ref(false);
const isReconnectDialogOpen = ref(false);
const selectedAccountIds = ref<string[]>([]);

// Collapsible states
const isConnectionDetailsOpen = ref(true);
const isConnectedAccountsOpen = ref(true);
const isConnectionValidityOpen = ref(false);
const isReconnectPending = ref(false);

const { data: connectionDetails, isLoading, error } = useBankConnectionDetails({ connectionId: connectionId });

// Initialize connection validity open state based on consent status
watch(
  () => connectionDetails.value?.consent,
  (consent) => {
    if (consent) {
      isConnectionValidityOpen.value = consent.isExpired || consent.isExpiringSoon;
    }
  },
  { immediate: true },
);

// Query for available accounts (only when dialog is open)
const {
  data: availableAccounts,
  isLoading: isLoadingAvailableAccounts,
  error: availableAccountsError,
} = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.bankAvailableExternalAccounts, connectionId.value],
  queryFn: () => getAvailableAccounts(connectionId.value),
  enabled: isFetchAccountsDialogOpen,
  retry: false,
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
          queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.bankConnectionChange) ||
          queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.currencies)
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

// Mutation for updating connection name
const { mutate: updateNameMutation, isPending: isSavingName } = useMutation({
  mutationFn: ({ connectionId, providerName }: { connectionId: number; providerName: string }) =>
    updateConnectionDetails(connectionId, { providerName }),
  onSuccess: () => {
    addSuccessNotification('Connection name updated successfully');
    queryClient.invalidateQueries({
      predicate: (query) => {
        const queryKey = query.queryKey as string[];
        return queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.bankConnectionChange);
      },
    });
    isEditNameDialogOpen.value = false;
  },
  onError: () => {
    addErrorNotification('Failed to update connection name');
  },
});

const isAccountConnected = (externalId: string): boolean => {
  return connectionDetails.value?.accounts.some((account) => account.externalId === externalId) ?? false;
};

const isForbiddenError = computed(() => {
  if (!availableAccountsError.value) return false;
  if (availableAccountsError.value instanceof ApiErrorResponseError) {
    return availableAccountsError.value.data.code === API_ERROR_CODES.forbidden;
  }
  return false;
});

const openFetchAccountsDialog = () => {
  isFetchAccountsDialogOpen.value = true;
};

const openDisconnectDialog = () => {
  isDisconnectDialogOpen.value = true;
};

const openEditNameDialog = () => {
  isEditNameDialogOpen.value = true;
};

const openReconnectDialog = () => {
  isReconnectDialogOpen.value = true;
};

const handleSaveConnectionName = (providerName: string) => {
  updateNameMutation({ connectionId: connectionId.value, providerName });
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

const formatRelativeTime = (dateString: string | null) => {
  if (!dateString) return 'never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const handleReconnect = async () => {
  try {
    isReconnectPending.value = true;
    // Call reauthorization API
    const response = await reauthorizeConnection(connectionId.value);

    // Store connection ID for OAuth callback
    localStorage.setItem('pendingEnableBankingConnectionId', String(connectionId.value));

    // Redirect to the authorization URL
    window.location.href = response.authUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start reauthorization';
    isReconnectPending.value = false;
    isReconnectDialogOpen.value = false;
    addErrorNotification(message);
  }
};

// Reset selected accounts when dialog closes
watch(isFetchAccountsDialogOpen, (isOpen) => {
  if (!isOpen) {
    selectedAccountIds.value = [];
  }
});
</script>
