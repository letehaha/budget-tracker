<template>
  <PageWrapper>
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl tracking-wider">{{ t('pages.integrations.title') }}</h1>

      <DemoRestricted :message="t('demo.bankConnectionsRestricted.title')">
        <UiButton :disabled="isDemo" @click="openAddIntegrationDialog">
          <PlusIcon class="size-5" />

          <span>
            {{ t('pages.integrations.addButton') }}
            <span class="max-sm:hidden">{{ t('pages.integrations.addButtonFull') }}</span>
          </span>
        </UiButton>
      </DemoRestricted>
    </div>

    <div v-if="isLoadingProviders || isLoadingConnections" class="py-8 text-center">
      {{ t('pages.integrations.loading') }}
    </div>

    <template v-else>
      <!-- Empty State -->
      <div
        v-if="!connections || connections.length === 0"
        class="flex min-h-100 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center md:p-12"
      >
        <div class="mb-4 text-6xl">🏦</div>
        <h2 class="mb-2 text-xl font-semibold tracking-wide">{{ t('pages.integrations.empty.title') }}</h2>
        <p class="text-muted-foreground mb-6 max-w-md">
          {{ t('pages.integrations.empty.description') }}
        </p>

        <DemoRestricted :message="t('demo.bankConnectionsRestricted.title')">
          <UiButton :disabled="isDemo" @click="openAddIntegrationDialog">
            <PlusIcon class="size-4" />
            {{ t('pages.integrations.empty.addFirstButton') }}
          </UiButton>
        </DemoRestricted>
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

                {{ t(METAINFO_FROM_TYPE[connection.providerType as keyof typeof METAINFO_FROM_TYPE]!.nameKey) }}
              </div>
            </CardHeader>

            <CardContent class="px-4! pb-4">
              <div class="mb-2 text-sm">
                <span class="text-muted-foreground">{{ t('pages.integrations.card.connectedAccounts') }}</span>
                <span class="ml-1">{{ connection.accountsCount }}</span>
              </div>
              <div v-if="connection.lastSyncAt" class="text-muted-foreground mb-3 text-sm">
                {{ t('pages.integrations.card.lastSync', { date: formatDate(connection.lastSyncAt) }) }}
              </div>
              <div class="flex gap-2">
                <UiButton
                  size="sm"
                  variant="outline"
                  :disabled="isDisconnecting"
                  @click.stop="handleDisconnect(connection.id)"
                >
                  {{ t('pages.integrations.card.disconnectButton') }}
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
      :providers="providers ?? []"
      @integration-added="handleIntegrationAdded"
    />

    <!-- Disconnect Integration Dialog -->
    <DisconnectIntegrationDialog
      v-model:open="isDisconnectDialogOpen"
      :is-disconnecting="isDisconnecting"
      @confirm="handleDisconnectConfirm"
    />
  </PageWrapper>
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
import PageWrapper from '@/components/common/page-wrapper.vue';
import { DemoRestricted } from '@/components/demo';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes';
import { useUserStore } from '@/stores';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { PlusIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import AddIntegrationDialog from './components/add-integration-dialog.vue';
import DisconnectIntegrationDialog from './components/disconnect-integration-dialog.vue';

const router = useRouter();
const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const userStore = useUserStore();
const { isDemo } = storeToRefs(userStore);
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
    addSuccessNotification(t('pages.integrations.notifications.disconnectSuccess'));
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.bankConnections });
    isDisconnectDialogOpen.value = false;
    connectionToDisconnect.value = null;
  },
  onError: () => {
    addErrorNotification(t('pages.integrations.notifications.disconnectFailed'));
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
