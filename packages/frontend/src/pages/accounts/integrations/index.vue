<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl tracking-wider">Bank Integrations</h1>

      <UiButton @click="openAddIntegrationDialog">
        <PlusIcon class="size-5" />

        Add Integration
      </UiButton>
    </div>

    <div v-if="isLoadingProviders || isLoadingConnections" class="py-8 text-center">Loading...</div>

    <template v-else>
      <!-- Empty State -->
      <div
        v-if="!connections || connections.length === 0"
        class="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center"
      >
        <div class="mb-4 text-6xl">🏦</div>
        <h2 class="mb-2 text-xl font-semibold tracking-wide">No Bank Integrations Yet</h2>
        <p class="text-muted-foreground mb-6 max-w-md">
          Connect your bank accounts to automatically import transactions and keep your finances up to date.
        </p>

        <UiButton @click="openAddIntegrationDialog">
          <PlusIcon class="size-4" />
          Add Your First Integration
        </UiButton>
      </div>

      <!-- Existing connections -->
      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        <template v-for="connection in connections" :key="connection.id">
          <Card
            class="relative cursor-pointer transition-shadow hover:shadow-lg"
            @click="goToConnectionDetails(connection.id)"
          >
            <CardHeader class="p-4">
              <div class="mb-2 text-lg font-medium tracking-wide">
                {{ connection.providerName }}
              </div>
              <div class="mt-3 flex items-center gap-2 text-base">
                <BankProviderLogo class="size-8" :provider="connection.providerType" />

                {{ METAINFO_FROM_TYPE[connection.providerType].name }}
              </div>
            </CardHeader>

            <CardContent class="px-4! pb-4">
              <div class="mb-2 text-sm">
                <span class="text-muted-foreground">Connected accounts:</span>
                <span class="ml-1">{{ connection.accountsCount }}</span>
              </div>
              <div v-if="connection.lastSyncAt" class="text-muted-foreground mb-3 text-sm">
                Last sync: {{ formatDate(connection.lastSyncAt) }}
              </div>
              <div class="flex gap-2">
                <UiButton
                  size="sm"
                  variant="outline"
                  :disabled="isDisconnecting"
                  @click.stop="handleDisconnect(connection.id)"
                >
                  Disconnect
                </UiButton>
              </div>
            </CardContent>
          </Card>
        </template>
      </div>
    </template>

    <!-- Add Integration Dialog -->
    <AddIntegrationDialog
      v-model:open="isDialogOpen"
      :providers="providers"
      @integration-added="handleIntegrationAdded"
    />

    <!-- Disconnect Integration Dialog -->
    <DisconnectIntegrationDialog
      v-model:open="isDisconnectDialogOpen"
      :is-disconnecting="isDisconnecting"
      @confirm="handleDisconnectConfirm"
    />
  </div>
</template>

<script lang="ts" setup>
import {
  type BankConnection,
  type BankProvider,
  disconnectProvider,
  listConnections,
  listProviders,
} from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { METAINFO_FROM_TYPE } from '@/common/const/bank-providers';
import BankProviderLogo from '@/components/common/bank-providers/bank-provider-logo.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { PlusIcon } from 'lucide-vue-next';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

import AddIntegrationDialog from './components/AddIntegrationDialog.vue';
import DisconnectIntegrationDialog from './components/DisconnectIntegrationDialog.vue';

const router = useRouter();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const queryClient = useQueryClient();

const isDialogOpen = ref(false);
const isDisconnectDialogOpen = ref(false);
const connectionToDisconnect = ref<number | null>(null);

// Query for providers
const { data: providers, isLoading: isLoadingProviders } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.bankProviders,
  queryFn: listProviders,
  staleTime: Infinity,
  placeholderData: [] as BankProvider[],
});

// Query for connections
const { data: connections, isLoading: isLoadingConnections } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.bankConnections,
  queryFn: listConnections,
  staleTime: 5 * 60 * 1000, // 5 minutes
  placeholderData: [] as BankConnection[],
});

// Mutation for disconnecting provider
const { mutate: disconnectMutation, isPending: isDisconnecting } = useMutation({
  mutationFn: disconnectProvider,
  onSuccess: () => {
    addSuccessNotification('Integration disconnected successfully');
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.bankConnections });
    isDisconnectDialogOpen.value = false;
    connectionToDisconnect.value = null;
  },
  onError: () => {
    addErrorNotification('Failed to disconnect integration');
  },
});

const openAddIntegrationDialog = () => {
  isDialogOpen.value = true;
};

const handleIntegrationAdded = () => {
  isDialogOpen.value = false;
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.bankConnections });
};

const handleDisconnect = (connectionId: number) => {
  connectionToDisconnect.value = connectionId;
  isDisconnectDialogOpen.value = true;
};

const handleDisconnectConfirm = (removeAssociatedAccounts: boolean) => {
  if (connectionToDisconnect.value === null) return;

  disconnectMutation({
    connectionId: connectionToDisconnect.value,
    removeAssociatedAccounts,
  });
};

const goToConnectionDetails = (connectionId: number) => {
  router.push({ name: ROUTES_NAMES.accountIntegrationDetails, params: { connectionId } });
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
</script>
