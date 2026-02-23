<script setup lang="ts">
import { type BankConnection, listConnections } from '@/api/bank-data-providers';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import BankProviderLogo from '@/components/common/bank-providers/bank-provider-logo.vue';
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { Separator } from '@/components/lib/ui/separator';
import * as Tabs from '@/components/lib/ui/tabs';
import AccountDeletionSection from '@/pages/account/components/account-deletion-section.vue';
import AccountDetailsTab from '@/pages/account/components/account-details-tab.vue';
import SettingAccountGroup from '@/pages/account/components/account-group.vue';
import AccountUnlinkSection from '@/pages/account/components/account-unlink-section.vue';
import SettingToggleVisibility from '@/pages/account/components/setting-toggle-visibility.vue';
import { ROUTES_NAMES } from '@/routes';
import { AccountModel, TransactionModel } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { ExternalLinkIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
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

const activeTab = ref('details');
const tabItems = computed(() => [
  { value: 'details', label: t('pages.account.tabs.details') },
  { value: 'integrations', label: t('pages.account.tabs.integrations') },
  { value: 'settings', label: t('pages.account.tabs.settings') },
]);
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

        <Separator />

        <AccountDeletionSection :account="account" :transactions="transactions" />
      </div>
    </Tabs.TabsContent>

    <Tabs.TabsContent value="integrations">
      <div class="grid gap-4 pt-6 text-sm">
        <div class="flex items-center justify-between gap-2">
          <span>{{ t('pages.account.integrations.connectedVia') }}</span>
          <RouterLink
            v-if="currentConnection"
            :to="{ name: ROUTES_NAMES.accountIntegrationDetails, params: { connectionId: currentConnection.id } }"
            class="text-primary flex items-center gap-1.5 text-sm font-medium hover:underline"
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
  </Tabs.Tabs>
</template>
