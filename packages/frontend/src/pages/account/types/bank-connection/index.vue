<script setup lang="ts">
import { type BankConnection, listConnections } from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import BankProviderLogo from '@/components/common/bank-providers/bank-provider-logo.vue';
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { Separator } from '@/components/lib/ui/separator';
import * as Tabs from '@/components/lib/ui/tabs';
import { useAccountAccess } from '@/composable/use-account-access';
import { useSyncStatus } from '@/composable/use-sync-status';
import AccountArchiveSection from '@/pages/account/components/account-archive-section.vue';
import AccountDeletionSection from '@/pages/account/components/account-deletion-section.vue';
import AccountDetailsTab from '@/pages/account/components/account-details-tab.vue';
import SettingAccountGroup from '@/pages/account/components/account-group.vue';
import AccountUnlinkSection from '@/pages/account/components/account-unlink-section.vue';
import SettingToggleVisibility from '@/pages/account/components/setting-toggle-visibility.vue';
import SharingPanel from '@/pages/account/components/sharing-panel/sharing-panel.vue';
import { ROUTES_NAMES } from '@/routes';
import { AccountModel, SHARE_PERMISSIONS, TransactionModel } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { AlertTriangleIcon, ExternalLinkIcon } from '@lucide/vue';
import { computed, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

import LoadTransactions from './load-transactions.vue';
import SyncTransactions from './sync-transactions.vue';

const { t } = useI18n();

const props = defineProps<{
  account: AccountModel;
  transactions: TransactionModel[];
}>();

const { data: connections } = useQuery<BankConnection[]>({
  queryKey: VUE_QUERY_CACHE_KEYS.bankConnections,
  queryFn: listConnections,
});

const currentConnection = computed(() =>
  connections.value?.find((c) => c.id === props.account.bankDataProviderConnectionId),
);

const { connectionsNeedingReauth } = useSyncStatus();

const needsReauth = computed(() => {
  const connectionId = props.account.bankDataProviderConnectionId;
  if (!connectionId) return false;
  return connectionsNeedingReauth.value.some((conn) => conn.connectionId === connectionId);
});

const { isOwner, permission } = useAccountAccess(toRef(() => props.account));
const canSeeSharingTab = computed(() => isOwner.value || permission.value === SHARE_PERMISSIONS.manage);

const activeTab = ref('details');
const tabItems = computed(() => {
  const items: { value: string; label: string; icon?: typeof AlertTriangleIcon; iconClass?: string }[] = [
    { value: 'details', label: t('pages.account.tabs.details') },
  ];
  if (isOwner.value) {
    items.push({
      value: 'integrations',
      label: t('pages.account.tabs.integrations'),
      ...(needsReauth.value ? { icon: AlertTriangleIcon, iconClass: 'text-destructive-text' } : {}),
    });
  }
  if (canSeeSharingTab.value) items.push({ value: 'sharing', label: t('pages.account.tabs.sharing') });
  items.push({ value: 'settings', label: t('pages.account.tabs.settings') });
  return items;
});
</script>

<template>
  <Tabs.Tabs v-model="activeTab">
    <PillTabs v-model="activeTab" :items="tabItems" class="mt-4 w-full" />

    <AccountDetailsTab tab-name="details" :account="account" />

    <Tabs.TabsContent value="settings">
      <div class="grid gap-4 pt-6">
        <SettingToggleVisibility :account="account" />

        <Separator />

        <SettingAccountGroup :account="account" />

        <template v-if="isOwner">
          <Separator />

          <AccountArchiveSection :account="account" />

          <AccountDeletionSection :account="account" :transactions="transactions" />
        </template>
      </div>
    </Tabs.TabsContent>

    <Tabs.TabsContent v-if="isOwner" value="integrations">
      <div class="grid gap-4 pt-6 text-sm">
        <div
          v-if="needsReauth && currentConnection"
          class="border-destructive/40 bg-destructive/5 flex items-start gap-3 rounded-lg border p-4"
        >
          <AlertTriangleIcon class="text-destructive-text mt-0.5 size-5 shrink-0" />
          <div class="flex-1 space-y-1">
            <p class="text-destructive-text font-medium">
              {{ t('pages.account.integrations.reauthBanner.title') }}
            </p>
            <p class="text-muted-foreground text-xs">
              {{ t('pages.account.integrations.reauthBanner.description') }}
            </p>
            <RouterLink
              :to="{ name: ROUTES_NAMES.accountIntegrationDetails, params: { connectionId: currentConnection.id } }"
              class="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
            >
              {{ t('pages.account.integrations.reauthBanner.reconnectLink') }}
              <ExternalLinkIcon class="size-3" />
            </RouterLink>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2">
          <span>{{ t('pages.account.integrations.connectedVia') }}</span>
          <RouterLink
            v-if="currentConnection"
            :to="{ name: ROUTES_NAMES.accountIntegrationDetails, params: { connectionId: currentConnection.id } }"
            class="flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <BankProviderLogo class="size-6" :provider="currentConnection.providerType" />
            {{ currentConnection.providerName }}
            <ExternalLinkIcon class="size-3.5" />
          </RouterLink>
        </div>

        <Separator />

        <SyncTransactions :account="account" />

        <Separator />

        <LoadTransactions :account="account" />

        <div class="border-destructive @container/danger-zone mt-2 grid gap-4 rounded-xl border p-4 sm:-mx-4">
          <p class="text-lg font-medium">{{ t('pages.account.deletion.dangerZone') }}</p>
          <AccountUnlinkSection :account="account" />
        </div>
      </div>
    </Tabs.TabsContent>

    <Tabs.TabsContent v-if="canSeeSharingTab" value="sharing">
      <div class="grid gap-4 pt-6">
        <SharingPanel :account="account" />
      </div>
    </Tabs.TabsContent>
  </Tabs.Tabs>
</template>
