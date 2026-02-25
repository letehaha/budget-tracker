<template>
  <PageWrapper>
    <div v-if="isLoading" class="py-8 text-center">{{ $t('pages.integrations.details.loading') }}</div>

    <div v-else-if="error" class="rounded-lg border border-red-500 p-4 text-red-700">
      <p>{{ $t('pages.integrations.details.error.loadFailed') }}</p>
      <UiButton variant="outline" class="mt-4" @click="router.push({ name: ROUTES_NAMES.accountIntegrations })">
        {{ $t('pages.integrations.details.error.backButton') }}
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
            <h2 class="text-lg font-semibold tracking-wide">
              {{ $t('pages.integrations.details.connectionDetails.title') }}
            </h2>
            <ChevronDownIcon
              class="size-5 transition-transform duration-200"
              :class="{ 'rotate-180': isConnectionDetailsOpen }"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent class="pt-0 max-sm:px-4 max-sm:pb-4">
              <div class="grid gap-4 md:grid-cols-2">
                <div>
                  <p class="text-muted-foreground text-sm">
                    {{ $t('pages.integrations.details.connectionDetails.type') }}
                  </p>
                  <p class="mt-1 flex items-center gap-2 font-medium">
                    <BankProviderLogo class="size-5" :provider="connectionDetails.providerType" />

                    {{ t(METAINFO_FROM_TYPE[connectionDetails.providerType].nameKey) }}
                  </p>
                </div>
                <div>
                  <p class="text-muted-foreground text-sm">
                    {{ $t('pages.integrations.details.connectionDetails.status') }}
                  </p>
                  <p class="font-medium">
                    {{
                      connectionDetails.isActive
                        ? $t('pages.integrations.details.connectionDetails.statusActive')
                        : $t('pages.integrations.details.connectionDetails.statusInactive')
                    }}
                  </p>
                </div>
                <div>
                  <p class="text-muted-foreground flex items-center gap-1 text-sm">
                    {{ $t('pages.integrations.details.connectionDetails.autoSync') }}

                    <ResponsiveTooltip
                      :content="$t('pages.integrations.details.connectionDetails.autoSyncTooltip')"
                      content-class-name="max-w-[300px] text-sm leading-6 text-white/90"
                    >
                      <InfoIcon class="text-primary size-4 cursor-pointer" />
                    </ResponsiveTooltip>
                  </p>
                  <p class="font-medium">
                    {{ $t('pages.integrations.details.connectionDetails.every12Hours') }}
                    <span class="text-muted-foreground font-normal">
                      {{
                        $t('pages.integrations.details.connectionDetails.lastSync', {
                          time: formatRelativeTime(connectionDetails.lastSyncAt),
                        })
                      }}
                    </span>
                  </p>
                </div>
                <div>
                  <p class="text-muted-foreground text-sm">
                    {{ $t('pages.integrations.details.connectionDetails.connectedAccounts') }}
                  </p>
                  <p class="font-medium">{{ connectionDetails.accounts.length }}</p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <!-- Auth Failure Banner (for LunchFlow and other API key providers) -->
      <Card v-if="isDeactivatedDueToAuth" class="border-destructive mb-6">
        <CardContent class="p-6">
          <div class="space-y-4">
            <div class="text-destructive-text bg-destructive/20 rounded-lg p-4">
              <p class="font-semibold">{{ $t('pages.integrations.authFailure.title') }}</p>
              <p class="mt-1 text-sm">
                {{ $t('pages.integrations.authFailure.description') }}
              </p>
            </div>
            <div class="flex gap-3">
              <UiButton variant="default" @click="isUpdateCredentialsDialogOpen = true">
                {{ $t('pages.integrations.authFailure.updateButton') }}
              </UiButton>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Update Credentials Dialog -->
      <Dialog v-model:open="isUpdateCredentialsDialogOpen">
        <DialogContent class="max-w-md">
          <DialogHeader class="mb-4">
            <DialogTitle>{{ $t('pages.integrations.updateCredentials.title') }}</DialogTitle>
          </DialogHeader>
          <div class="space-y-4">
            <div>
              <label class="mb-2 block text-sm font-medium">
                {{ $t('pages.integrations.updateCredentials.apiKeyLabel') }}
              </label>
              <input
                v-model="newApiKey"
                type="password"
                class="w-full rounded-md border px-3 py-2"
                :placeholder="$t('pages.integrations.updateCredentials.apiKeyPlaceholder')"
              />
            </div>
          </div>
          <DialogFooter class="mt-6 grid gap-3 sm:grid-cols-2">
            <UiButton variant="outline" @click="isUpdateCredentialsDialogOpen = false">
              {{ $t('common.actions.cancel') }}
            </UiButton>
            <UiButton :disabled="!newApiKey || isUpdatingCredentials" @click="handleUpdateCredentials">
              {{
                isUpdatingCredentials
                  ? $t('pages.integrations.updateCredentials.updatingButton')
                  : $t('pages.integrations.updateCredentials.updateButton')
              }}
            </UiButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <h2 class="text-lg font-semibold tracking-wide">
                {{ $t('pages.integrations.details.connectionValidity.title') }}
              </h2>
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
                    ? $t('pages.integrations.details.connectionValidity.statusExpired')
                    : connectionDetails.consent.isExpiringSoon
                      ? $t('pages.integrations.details.connectionValidity.statusExpiringSoon')
                      : $t('pages.integrations.details.connectionValidity.statusActive')
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
                  <p class="font-semibold">{{ $t('pages.integrations.details.connectionValidity.expiredTitle') }}</p>
                  <p class="mt-1 text-sm">
                    {{ $t('pages.integrations.details.connectionValidity.expiredDescription') }}
                  </p>
                </div>
                <div
                  v-else-if="connectionDetails.consent.isExpiringSoon"
                  class="rounded-lg bg-yellow-100 p-4 text-yellow-800"
                >
                  <p class="font-semibold">
                    {{ $t('pages.integrations.details.connectionValidity.expiringSoonTitle') }}
                  </p>
                  <p class="mt-1 text-sm">
                    {{
                      $t('pages.integrations.details.connectionValidity.expiringSoonDescription', {
                        days: connectionDetails.consent.daysRemaining,
                      })
                    }}
                  </p>
                </div>

                <!-- Validity Details -->
                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <p class="text-muted-foreground text-sm">
                      {{ $t('pages.integrations.details.connectionValidity.validFrom') }}
                    </p>
                    <p class="font-medium">
                      {{
                        connectionDetails.consent.validFrom
                          ? formatDate(connectionDetails.consent.validFrom)
                          : $t('pages.integrations.details.connectionValidity.notAvailable')
                      }}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted-foreground text-sm">
                      {{ $t('pages.integrations.details.connectionValidity.validUntil') }}
                    </p>
                    <p class="font-medium">
                      {{ formatDate(connectionDetails.consent.validUntil) }}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted-foreground text-sm">
                      {{ $t('pages.integrations.details.connectionValidity.daysRemaining') }}
                    </p>
                    <p
                      class="font-medium"
                      :class="{
                        'text-destructive-text': connectionDetails.consent.isExpired,
                        'text-yellow-600': connectionDetails.consent.isExpiringSoon,
                      }"
                    >
                      {{
                        $t(
                          'pages.integrations.details.connectionValidity.daysCount',
                          connectionDetails.consent.daysRemaining,
                        )
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
                    {{ $t('pages.integrations.details.connectionValidity.validConnectionHint') }}
                  </p>
                  <UiButton variant="default" @click="openReconnectDialog">
                    {{ $t('pages.integrations.details.connectionValidity.reconnectButton') }}
                  </UiButton>
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
              <h2 class="text-lg font-semibold tracking-wide whitespace-nowrap">
                {{ $t('pages.integrations.details.connectedAccounts.title') }}
              </h2>

              <ChevronDownIcon
                class="size-5 transition-transform duration-200"
                :class="{ 'rotate-180': isConnectedAccountsOpen }"
              />
            </CollapsibleTrigger>

            <UiButton class="ml-auto hidden @[550px]/connect-accounts:block" size="sm" @click="openFetchAccountsDialog">
              {{ $t('pages.integrations.details.connectedAccounts.connectRemainingButton') }}
            </UiButton>
          </div>
          <CollapsibleContent>
            <CardContent class="pt-0">
              <UiButton
                class="mb-4 ml-auto block @[550px]/connect-accounts:hidden"
                size="sm"
                @click="openFetchAccountsDialog"
              >
                {{ $t('pages.integrations.details.connectedAccounts.connectRemainingButton') }}
              </UiButton>

              <div
                v-if="connectionDetails.accounts.length === 0"
                class="text-muted-foreground space-y-4 py-8 text-center"
              >
                <p>{{ $t('pages.integrations.details.connectedAccounts.empty') }}</p>

                <UiButton size="sm" @click="openFetchAccountsDialog">{{
                  $t('pages.integrations.details.connectedAccounts.connectButton')
                }}</UiButton>
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
                      {{ $t('pages.integrations.details.connectedAccounts.externalId', { id: account.externalId }) }}
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
          <h2 class="text-lg font-semibold tracking-wide">{{ $t('pages.integrations.details.actions.title') }}</h2>
        </CardHeader>

        <CardContent>
          <div class="flex gap-4 max-sm:p-4">
            <UiButton variant="destructive" :disabled="isDisconnecting" @click="openDisconnectDialog">
              {{ $t('pages.integrations.details.actions.disconnectButton') }}
            </UiButton>
          </div>
        </CardContent>
      </Card>
    </template>

    <!-- Fetch Accounts Dialog -->
    <Dialog v-model:open="isFetchAccountsDialogOpen">
      <DialogContent class="max-h-screen max-w-2xl overflow-y-auto">
        <DialogHeader class="mb-4">
          <DialogTitle>{{ $t('pages.integrations.details.fetchAccountsDialog.title') }}</DialogTitle>

          <DialogDescription class="mt-2">
            {{
              $t('pages.integrations.details.fetchAccountsDialog.description', {
                providerName: connectionDetails?.providerName,
              })
            }}

            <div class="mt-2">
              <Popover.Popover>
                <Popover.PopoverTrigger class="text-primary flex cursor-pointer items-center gap-2 text-sm">
                  {{ $t('pages.integrations.details.fetchAccountsDialog.missingAccountsQuestion') }}
                  <InfoIcon class="size-4" />
                </Popover.PopoverTrigger>
                <Popover.PopoverContent class="max-w-[320px]">
                  <i18n-t
                    keypath="pages.integrations.details.fetchAccountsDialog.missingAccountsHint"
                    tag="p"
                    class="text-sm leading-6"
                  >
                    <template #section>
                      <strong>{{
                        $t('pages.integrations.details.fetchAccountsDialog.missingAccountsSectionName')
                      }}</strong>
                    </template>
                    <template #button>
                      <strong>{{
                        $t('pages.integrations.details.fetchAccountsDialog.missingAccountsButtonName')
                      }}</strong>
                    </template>
                  </i18n-t>
                  <p class="text-muted-foreground mt-2 text-sm">
                    {{ $t('pages.integrations.details.fetchAccountsDialog.missingAccountsPersist') }}
                  </p>
                </Popover.PopoverContent>
              </Popover.Popover>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div v-if="isLoadingAvailableAccounts" class="py-8 text-center">
          {{ $t('pages.integrations.details.fetchAccountsDialog.loadingAccounts') }}
        </div>

        <div v-else-if="availableAccountsError" class="border-destructive text-destructive-text rounded-lg border p-4">
          <p v-if="isForbiddenError">{{ $t('pages.integrations.details.fetchAccountsDialog.sessionExpired') }}</p>
          <p v-else>{{ $t('pages.integrations.details.fetchAccountsDialog.loadFailed') }}</p>
        </div>

        <div v-else-if="availableAccounts && availableAccounts.length === 0" class="py-8 text-center">
          <p class="text-muted-foreground">
            {{ $t('pages.integrations.details.fetchAccountsDialog.noAdditionalAccounts') }}
          </p>
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
                  {{ $t('pages.integrations.details.fetchAccountsDialog.connectedBadge') }}
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
          <UiButton variant="outline" @click="isFetchAccountsDialogOpen = false">{{
            $t('common.actions.cancel')
          }}</UiButton>
          <UiButton
            :disabled="isSyncingAccounts || selectedAccountIds.length === 0"
            @click="handleSyncSelectedAccounts"
          >
            <template v-if="selectedAccountIds.length">
              <span>
                {{
                  $t('pages.integrations.details.fetchAccountsDialog.connectSelectedButton', {
                    count: selectedAccountIds.length,
                  })
                }}
              </span>
            </template>
            <template v-else>
              <span>{{ $t('pages.integrations.details.fetchAccountsDialog.selectAccountsButton') }}</span>
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
  </PageWrapper>
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
import PageWrapper from '@/components/common/page-wrapper.vue';
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
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import DisconnectIntegrationDialog from './components/disconnect-integration-dialog.vue';
import EditConnectionNameDialog from './components/edit-connection-name-dialog.vue';
import ReconnectConfirmationDialog from './components/reconnect-confirmation-dialog.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const queryClient = useQueryClient();

const connectionId = computed(() => Number(route.params.connectionId));
const isFetchAccountsDialogOpen = ref(false);
const isDisconnectDialogOpen = ref(false);
const isEditNameDialogOpen = ref(false);
const isReconnectDialogOpen = ref(false);
const isUpdateCredentialsDialogOpen = ref(false);
const selectedAccountIds = ref<string[]>([]);
const newApiKey = ref('');

// Collapsible states
const isConnectionDetailsOpen = ref(true);
const isConnectedAccountsOpen = ref(true);
const isConnectionValidityOpen = ref(false);
const isReconnectPending = ref(false);

const { data: connectionDetails, isLoading, error } = useBankConnectionDetails({ connectionId: connectionId });

const isDeactivatedDueToAuth = computed(
  () =>
    connectionDetails.value &&
    !connectionDetails.value.isActive &&
    connectionDetails.value.deactivationReason === 'auth_failure',
);

// Mutation for updating credentials
const { mutate: updateCredentialsMutation, isPending: isUpdatingCredentials } = useMutation({
  mutationFn: (credentials: Record<string, unknown>) => updateConnectionDetails(connectionId.value, { credentials }),
  onSuccess: () => {
    addSuccessNotification(t('pages.integrations.updateCredentials.success'));
    queryClient.invalidateQueries({
      predicate: (query) => {
        const queryKey = query.queryKey as string[];
        return queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.bankConnectionChange);
      },
    });
    isUpdateCredentialsDialogOpen.value = false;
    newApiKey.value = '';
  },
  onError: (err) => {
    const message = err instanceof Error ? err.message : t('pages.integrations.updateCredentials.failed');
    addErrorNotification(message);
  },
});

const handleUpdateCredentials = () => {
  if (!newApiKey.value) return;
  updateCredentialsMutation({ apiKey: newApiKey.value });
};

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
    addSuccessNotification(t('pages.integrations.notifications.connectAccountsSuccess'));
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
    addErrorNotification(t('pages.integrations.notifications.connectAccountsFailed'));
  },
});

// Mutation for disconnecting provider
const { mutate: disconnectMutation, isPending: isDisconnecting } = useMutation({
  mutationFn: disconnectProvider,
  onSuccess: () => {
    addSuccessNotification(t('pages.integrations.notifications.disconnectSuccess'));
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
    addErrorNotification(t('pages.integrations.notifications.disconnectFailed'));
  },
});

// Mutation for updating connection name
const { mutate: updateNameMutation, isPending: isSavingName } = useMutation({
  mutationFn: ({ connectionId: connId, providerName }: { connectionId: number; providerName: string }) =>
    updateConnectionDetails(connId, { providerName }),
  onSuccess: () => {
    addSuccessNotification(t('pages.integrations.notifications.updateNameSuccess'));
    queryClient.invalidateQueries({
      predicate: (query) => {
        const queryKey = query.queryKey as string[];
        return queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.bankConnectionChange);
      },
    });
    isEditNameDialogOpen.value = false;
  },
  onError: () => {
    addErrorNotification(t('pages.integrations.notifications.updateNameFailed'));
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
  if (!dateString) return t('pages.integrations.details.relativeTime.never');

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return t('pages.integrations.details.relativeTime.justNow');
  if (diffMinutes < 60) return t('pages.integrations.details.relativeTime.minutesAgo', { count: diffMinutes });
  if (diffHours < 24) return t('pages.integrations.details.relativeTime.hoursAgo', diffHours);
  return t('pages.integrations.details.relativeTime.daysAgo', diffDays);
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
  } catch (err) {
    const message = err instanceof Error ? err.message : t('pages.integrations.details.errors.reauthorizationFailed');
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
